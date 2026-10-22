import { randomBytes } from "node:crypto";
import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { validVerificationSettings, type BookingVerification, type VerificationSettings } from "@/lib/identity";
import { identityFiles, identityProfiles } from "@/lib/identity-store";
import { lineConfigured, pushLine } from "@/lib/line";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";

type BookingDoc = { _id: string; status: string; billToken?: string; lineUserId?: string; verification?: BookingVerification };

// What the reviewer needs for one booking: the customer's details and the ids of the stored images.
export async function GET(request: Request) {
  const auth = await requireAdmin("identity");
  if (auth.error) return auth.error;
  const bookingId = new URL(request.url).searchParams.get("bookingId") || "";
  const db = await database();
  const booking = await db.collection<BookingDoc>("bookingRequests").findOne({ _id: bookingId }, { projection: { verification: 1 } });
  if (!booking?.verification) return Response.json({ error: "รายการนี้ไม่ได้เลือกยืนยันตัวตน" }, { status: 404 });
  const [profile, files] = await Promise.all([
    identityProfiles(db).findOne({ _id: booking.verification.profileId }, { projection: { fullName: 1, address: 1, backupPhone: 1, social: 1, status: 1, approvedAt: 1, approvedByName: 1, consentAt: 1 } }),
    identityFiles(db).find({ bookingId }, { projection: { _id: 1, kind: 1, size: 1, createdAt: 1 } }).toArray(),
  ]);
  return Response.json({ profile, files });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const db = await database();
  if (body?.action === "settings") {
    const auth = await requireAdmin("settings");
    if (auth.error) return auth.error;
    if (!validVerificationSettings(body.settings)) return Response.json({ error: "ตรวจสอบการตั้งค่าอีกครั้ง" }, { status: 400 });
    const value = body.settings as VerificationSettings;
    const verification: VerificationSettings = { enabled: value.enabled, maxRental: value.maxRental, excludedCategories: [...new Set(value.excludedCategories.map(item => item.trim()))], validMonths: value.validMonths, deleteAfterDays: value.deleteAfterDays, note: value.note.trim() };
    const before = (await getStoreSettings()).verification;
    await db.collection<{ _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { verification } }, { upsert: true });
    revalidateTag("catalog", { expire: 0 });
    const changes = diff(before, verification);
    if (changes.length) await audit(request, auth.admin, { action: "settings.identity", targetType: "settings", targetId: "verification", summary: "แก้ไขการตั้งค่ายืนยันตัวตนแทนเงินประกัน", changes });
    return Response.json({ verification });
  }
  const auth = await requireAdmin("identity");
  if (auth.error) return auth.error;
  if (body?.action !== "review" || typeof body.bookingId !== "string" || typeof body.approve !== "boolean" || typeof body.reason !== "string" || body.reason.length > 300) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const reason = body.reason.trim();
  if (!body.approve && !reason) return Response.json({ error: "กรุณาระบุสิ่งที่ต้องให้ลูกค้าแก้หรือส่งใหม่" }, { status: 400 });
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.bookingId });
  if (!booking?.verification) return Response.json({ error: "รายการนี้ไม่ได้เลือกยืนยันตัวตน" }, { status: 404 });
  if (body.approve && !(await identityFiles(db).countDocuments({ bookingId: booking._id })) && !booking.verification.reused) return Response.json({ error: "ลูกค้ายังไม่ได้ส่งเอกสาร" }, { status: 409 });
  const now = new Date();
  const verification: BookingVerification = { ...booking.verification, status: body.approve ? "approved" : "rejected", reviewedAt: now, reviewedByName: auth.admin.name, reason: body.approve ? "" : reason };
  await bookings.updateOne({ _id: booking._id }, { $set: { verification, updatedAt: now } });
  await identityProfiles(db).updateOne({ _id: booking.verification.profileId }, body.approve
    ? { $set: { status: "approved", approvedAt: now, approvedByName: auth.admin.name, updatedAt: now }, ...(booking.lineUserId ? { $addToSet: { lineUserIds: booking.lineUserId } } : {}) }
    : { $set: { status: "rejected", updatedAt: now } });
  await audit(request, auth.admin, { action: body.approve ? "identity.approved" : "identity.rejected", targetType: "booking", targetId: booking._id, summary: body.approve ? "ตรวจเอกสารยืนยันตัวตนแล้ว ผ่าน" : `ขอเอกสารใหม่: ${reason}`, changes: [{ field: "status", before: booking.verification.status, after: verification.status }] });
  let lineNotified = false;
  if (booking.lineUserId && lineConfigured()) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: booking._id }, { $set: { billToken } });
    const link = `${new URL(request.url).origin}/bill/${billToken}`;
    const message = body.approve ? `✅ ยืนยันตัวตนคำขอ ${booking._id} เรียบร้อยแล้วค่ะ ไม่ต้องวางเงินประกัน ร้านจะดำเนินการตามกำหนดนะคะ 💗` : `รบกวนส่งเอกสารยืนยันตัวตนคำขอ ${booking._id} ใหม่อีกครั้งค่ะ 🙏\nเหตุผล: ${reason}\nส่งได้ที่ ${link}`;
    try { await pushLine(booking.lineUserId, [{ type: "text", text: message }]); lineNotified = true; } catch (error) { console.error("LINE identity notice failed:", error); }
  }
  return Response.json({ ok: true, verification: { ...verification, reviewedAt: now.toISOString() }, lineNotified });
}
