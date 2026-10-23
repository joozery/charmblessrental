import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export type CustomerRecord = { _id: string; lineUserId: string; lineName: string; name: string; phone: string; bookingCount: number; completedCount: number; creditBalance: number; createdAt: Date; updatedAt: Date };
export type CreditEntry = { _id: string; customerId: string; amount: number; remaining: number; type: "grant" | "use" | "void" | "expire"; reason: string; bookingId?: string; billToken?: string; expiresAt?: Date; createdAt: Date; createdBy: string; createdByName: string };

export const customers = (db: Db) => db.collection<CustomerRecord>("customers");
export const creditEntries = (db: Db) => db.collection<CreditEntry>("customerCredits");

// Backfill customers for bookings linked before the customer page existed.
export async function syncCustomersFromBookings(db: Db) {
  const rows = await db.collection<{ lineUserId?: string; lineName?: string; name?: string; phone?: string; status?: string }>("bookingRequests").find({ lineUserId: { $exists: true, $type: "string" } }, { projection: { lineUserId: 1, lineName: 1, name: 1, phone: 1, status: 1 } }).toArray();
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) if (row.lineUserId) grouped.set(row.lineUserId, [...(grouped.get(row.lineUserId) || []), row]);
  for (const [lineUserId, bookings] of grouped) {
    const latest = bookings[bookings.length - 1];
    await customers(db).updateOne({ _id: lineUserId }, { $set: { lineUserId, lineName: latest.lineName || "", name: latest.name || "", phone: latest.phone || "", bookingCount: bookings.length, completedCount: bookings.filter(row => row.status === "confirmed").length, updatedAt: new Date() }, $setOnInsert: { creditBalance: 0, createdAt: new Date() } }, { upsert: true });
  }
  return grouped.size;
}

export async function ensureCustomer(db: Db, input: { lineUserId: string; lineName?: string; name?: string; phone?: string }) {
  const now = new Date();
  await customers(db).updateOne({ _id: input.lineUserId }, { $set: { lineUserId: input.lineUserId, ...(input.lineName !== undefined ? { lineName: input.lineName } : {}), ...(input.name !== undefined ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), updatedAt: now }, $setOnInsert: { bookingCount: 0, completedCount: 0, creditBalance: 0, createdAt: now } }, { upsert: true });
  return customers(db).findOne({ _id: input.lineUserId });
}

export async function grantCredit(db: Db, input: { customerId: string; amount: number; reason: string; bookingId?: string; billToken?: string; createdBy: string; createdByName: string }) {
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new Error("CREDIT_AMOUNT_INVALID");
  const now = new Date(), expiresAt = new Date(now.getTime() + 60 * 86400000), id = randomUUID();
  await creditEntries(db).insertOne({ _id: id, customerId: input.customerId, amount, remaining: amount, type: "grant", reason: input.reason.slice(0, 300), ...(input.bookingId ? { bookingId: input.bookingId } : {}), ...(input.billToken ? { billToken: input.billToken } : {}), expiresAt, createdAt: now, createdBy: input.createdBy, createdByName: input.createdByName });
  await customers(db).updateOne({ _id: input.customerId }, { $inc: { creditBalance: amount }, $set: { updatedAt: now } });
  return id;
}

export async function expireCredits(db: Db, customerId?: string) {
  const now = new Date();
  const filter = { type: "grant" as const, remaining: { $gt: 0 }, expiresAt: { $lte: now }, ...(customerId ? { customerId } : {}) };
  const expired = await creditEntries(db).find(filter).toArray();
  if (!expired.length) return 0;
  await creditEntries(db).updateMany(filter, { $set: { type: "expire", remaining: 0 } });
  const total = expired.reduce((sum, row) => sum + row.remaining, 0);
  await customers(db).updateMany(customerId ? { _id: customerId } : { _id: { $in: expired.map(row => row.customerId) } }, { $inc: { creditBalance: -total }, $set: { updatedAt: now } });
  return total;
}

