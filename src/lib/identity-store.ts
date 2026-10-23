import { randomUUID } from "node:crypto";
import { Binary, type Db } from "mongodb";
import { imageType } from "./r2";
import type { BookingVerification, IdentityFileKind, VerificationSettings } from "./identity";

// ID card photos never go to the public image bucket: they live here, are served only to admins with the
// "identity" permission, and are deleted a set number of days after the rental ends.
export type IdentityFile = { _id: string; bookingId: string; profileId: string; kind: IdentityFileKind; contentType: string; size: number; data: Binary; createdAt: Date };
export type IdentityProfile = {
  _id: string; phone: string; fullName: string; address: string; backupPhone: string; social: string;
  status: "submitted" | "approved" | "rejected"; approvedAt?: Date; approvedByName?: string; lineUserIds: string[];
  consentAt: Date; updatedAt: Date;
};
export const identityFiles = (db: Db) => db.collection<IdentityFile>("identityFiles");
export const identityProfiles = (db: Db) => db.collection<IdentityProfile>("identityProfiles");
const maxBytes = 3 * 1024 * 1024;

export function readImage(bytes: Buffer) {
  const contentType = imageType(bytes);
  if (!contentType || bytes.length > maxBytes) return null;
  return { contentType, data: new Binary(bytes) };
}

export async function saveSubmission(db: Db, booking: { _id: string; phone: string }, profileId: string, fields: Pick<IdentityProfile, "fullName" | "address">, files: { kind: IdentityFileKind; contentType: string; data: Binary }[]) {
  const now = new Date();
  // A new submission replaces the files sent earlier for this booking.
  await identityFiles(db).deleteMany({ bookingId: booking._id });
  await identityFiles(db).insertMany(files.map(file => ({ _id: randomUUID(), bookingId: booking._id, profileId, kind: file.kind, contentType: file.contentType, size: file.data.length(), data: file.data, createdAt: now })));
  await identityProfiles(db).updateOne({ _id: profileId }, { $set: { phone: booking.phone, ...fields, backupPhone: "", social: "", status: "submitted", consentAt: now, updatedAt: now }, $setOnInsert: { lineUserIds: [] } }, { upsert: true });
}

// A customer approved within `validMonths` and reached through the same LINE account skips sending documents again.
export async function reusableProfile(db: Db, profileId: string, lineUserId: string, settings: VerificationSettings) {
  if (!settings.validMonths) return null;
  const profile = await identityProfiles(db).findOne({ _id: profileId, status: "approved", lineUserIds: lineUserId });
  if (!profile?.approvedAt) return null;
  const until = new Date(profile.approvedAt); until.setMonth(until.getMonth() + settings.validMonths);
  return until > new Date() ? profile : null;
}

type Ended = { _id: string; status: string; returned?: { at: Date }; updatedAt?: Date; verification?: BookingVerification };
// Daily: drop document images N days after the piece came back (or the request was cancelled), and forget profiles past their validity.
export async function purgeIdentity(db: Db, settings: VerificationSettings) {
  const cutoff = new Date(Date.now() - settings.deleteAfterDays * 86400000);
  const ended = await db.collection<Ended>("bookingRequests").find({ "verification.mode": "identity", $or: [{ "returned.at": { $lt: cutoff } }, { status: "cancelled", updatedAt: { $lt: cutoff } }] }, { projection: { _id: 1 } }).toArray();
  const ids = ended.map(row => row._id);
  const removed = ids.length ? (await identityFiles(db).deleteMany({ bookingId: { $in: ids } })).deletedCount : 0;
  const stale = new Date(); stale.setMonth(stale.getMonth() - Math.max(settings.validMonths, 1));
  const forgotten = (await identityProfiles(db).deleteMany({ updatedAt: { $lt: stale }, $or: [{ approvedAt: { $exists: false } }, { approvedAt: { $lt: stale } }] })).deletedCount;
  return { bookings: ids, removed, forgotten };
}
