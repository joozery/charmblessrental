import type { Db } from "mongodb";

// The admin a bill counts for (commission): whoever first priced it in the quote, or opened it from the back office.
// Set once; later edits by others do not move it, and only the owner reassigns it on the commission page.
export type BillOwner = { adminId: string; name: string; email: string; at: Date; assignedByName?: string };
type Actor = { _id: string; name: string; email?: string; username: string };

export const ownerOf = (admin: Actor, assignedByName?: string): BillOwner => ({ adminId: String(admin._id), name: admin.name, email: admin.email || admin.username, at: new Date(), ...(assignedByName ? { assignedByName } : {}) });

export async function claimBill(db: Db, bookingId: string, admin: Actor) {
  await db.collection<{ _id: string; billOwner?: BillOwner }>("bookingRequests").updateOne({ _id: bookingId, billOwner: { $exists: false } }, { $set: { billOwner: ownerOf(admin) } });
}

// Bills priced before owners were recorded: the first admin in their history who created or priced them.
export async function backfillBillOwners(db: Db) {
  const bookings = db.collection<{ _id: string; billOwner?: BillOwner }>("bookingRequests");
  const missing = await bookings.find({ billOwner: { $exists: false }, quote: { $exists: true } }, { projection: { _id: 1 } }).toArray();
  if (!missing.length) return;
  const firsts = await db.collection("auditLogs").aggregate<{ _id: string; actorId: string; actorName: string; actorEmail: string; at: Date }>([
    { $match: { targetType: "booking", targetId: { $in: missing.map(row => row._id) }, action: { $in: ["booking.created", "booking.quote"] }, actorId: { $ne: null } } },
    { $sort: { at: 1 } },
    { $group: { _id: "$targetId", actorId: { $first: "$actorId" }, actorName: { $first: "$actorName" }, actorEmail: { $first: "$actorEmail" }, at: { $first: "$at" } } },
  ]).toArray();
  for (const row of firsts) await bookings.updateOne({ _id: row._id, billOwner: { $exists: false } }, { $set: { billOwner: { adminId: String(row.actorId), name: row.actorName, email: row.actorEmail, at: row.at } } });
}
