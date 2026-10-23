import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export type FinanceTransaction = {
  _id: string; type: "income" | "expense"; category: string; amount: number; date: Date; note: string;
  createdAt: Date; createdBy: string; createdByName?: string;
  bookingId?: string; source?: "manual" | "booking" | "deposit" | "extension" | "late" | "adjustment";
  voided?: { at: Date; by: string; byName: string; reason: string };
};
export type DepositRefund = { amount: number; deducted: number; reason: string; transferRef?: string; date: Date; evidence: string[]; at: Date; by: string; byName: string };
// Customer money held by the shop, kept apart from income. _id is the booking id: one deposit per booking.
export type DepositRecord = {
  _id: string; bookingId: string; customerName: string; amount: number;
  status: "held" | "refunded" | "partial" | "forfeited" | "void";
  receivedAt: Date; receivedBy: string; receivedByName: string; refund?: DepositRefund; updatedAt: Date;
};
type Actor = { name: string; email?: string; username: string };
type PaidBooking = { _id: string; name?: string; quote?: { rental?: number; deposit?: number; shipping?: number } };

export const thaiDay = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const validDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const ledgerDate = (day: string) => new Date(`${day}T12:00:00.000Z`);
export const transactions = (db: Db) => db.collection<FinanceTransaction>("financeTransactions");
export const deposits = (db: Db) => db.collection<DepositRecord>("deposits");

// Confirming payment books rent and shipping as income and the deposit as money held, never as income.
export async function recordBookingPayment(db: Db, booking: PaidBooking, actor: Actor, day: string) {
  const by = actor.email || actor.username, date = ledgerDate(day), now = new Date();
  const rental = booking.quote?.rental || 0, shipping = booking.quote?.shipping || 0, deposit = booking.quote?.deposit || 0;
  const rows: FinanceTransaction[] = [
    ...(rental > 0 ? [{ category: "ค่าเช่า", amount: rental }] : []),
    ...(shipping > 0 ? [{ category: "ค่าจัดส่ง", amount: shipping }] : []),
  ].map(row => ({ _id: randomUUID(), type: "income", ...row, date, note: `รับชำระคำขอ ${booking._id}`, createdAt: now, createdBy: by, createdByName: actor.name, bookingId: booking._id, source: "booking" }));
  if (rows.length) await transactions(db).insertMany(rows);
  if (deposit > 0) await deposits(db).replaceOne({ _id: booking._id }, { bookingId: booking._id, customerName: booking.name || "", amount: deposit, status: "held", receivedAt: date, receivedBy: by, receivedByName: actor.name, updatedAt: now }, { upsert: true });
  return { rental, shipping, deposit };
}

export async function voidBookingPayment(db: Db, bookingId: string, actor: Actor, reason: string) {
  const voided = { at: new Date(), by: actor.email || actor.username, byName: actor.name, reason };
  await transactions(db).updateMany({ bookingId, source: "booking", voided: { $exists: false } }, { $set: { voided } });
  await deposits(db).updateOne({ _id: bookingId, status: "held" }, { $set: { status: "void", updatedAt: new Date() } });
}
