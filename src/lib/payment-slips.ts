import type { Binary, Db } from "mongodb";

// Transfer slips customers attach on their bill. Like ID documents they stay out of the public image bucket
// and are served only to admins. A slip Slip2Go confirms (right amount, the shop's account, never used before)
// marks the bill paid by itself; any other slip waits for the shop to look at it.
export type SlipStatus = "verified" | "review" | "accepted" | "rejected";
export type PaymentSlip = {
  _id: string; bookingId: string; billToken?: string; contentType: string; size: number; data: Binary; createdAt: Date;
  status: SlipStatus; reason: string; due: number;
  transRef?: string; amount?: number; dateTime?: string; senderName?: string; receiverName?: string; raw?: string;
  reviewedAt?: Date; reviewedByName?: string;
};
export const slipStatusLabels: Record<SlipStatus, string> = { verified: "ตรวจผ่านอัตโนมัติ", review: "รอร้านตรวจสลิป", accepted: "ร้านยืนยันสลิปแล้ว", rejected: "สลิปไม่ถูกต้อง" };
let indexes: Promise<unknown> | undefined;
export async function paymentSlips(db: Db) {
  const collection = db.collection<PaymentSlip>("paymentSlips");
  indexes ??= collection.createIndexes([{ key: { bookingId: 1, createdAt: -1 } }, { key: { transRef: 1 } }, { key: { status: 1 } }]).catch(error => { indexes = undefined; throw error; });
  await indexes;
  return collection;
}
// What a bill owes before payment: the same total the bill shows.
export const billDue = (quote?: { rental?: number; deposit?: number; shipping?: number } | null) => (quote?.rental || 0) + (quote?.deposit || 0) + (quote?.shipping || 0);
