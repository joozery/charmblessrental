import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { audit } from "./audit";
import { getQueue, holdMinutes } from "./availability-store";
import { lineConfigured, pushLine } from "./line";
import { blockRange, type ScheduleRecord } from "./schedule";
import { requestOrigin } from "@/lib/request-origin";

type Waiting = { _id: string; name?: string; start: string; end: string; schedule?: ScheduleRecord; items: { id: number }[]; createdAt: Date; lineUserId?: string; billToken?: string; holdUntil?: Date; payment?: string; verification?: { status?: string }; holdExpiredNoticeSentAt?: Date; waitlist?: { since?: Date } };

// Requests waiting behind someone's payment hold, oldest first: each whose pieces are free again gets its turn now,
// with the same time to pay. Runs whenever the queue is looked at (booking, availability, admin pages, daily cron).
export async function promoteWaitlist(db: Db, request: Request | null, origin = request ? requestOrigin(request) : undefined) {
  const bookings = db.collection<Waiting>("bookingRequests");
  const expired = await bookings.find({
    status: { $in: ["new", "contacted"] }, payment: { $ne: "paid" }, waitlist: { $exists: false }, holdExpiredNoticeSentAt: { $exists: false },
    $or: [{ holdUntil: { $lte: new Date() } }, { holdUntil: { $exists: false }, createdAt: { $lte: new Date(Date.now() - holdMinutes * 60000) } }],
  }, { projection: { _id: 1, name: 1, lineUserId: 1 } }).limit(50).toArray();
  for (const row of expired) {
    const marked = await bookings.updateOne({ _id: row._id, status: { $in: ["new", "contacted"] }, holdExpiredNoticeSentAt: { $exists: false } }, { $set: { status: "cancelled", holdExpiredNoticeSentAt: new Date(), cancelledAt: new Date(), cancelReason: "หมดเวลาชำระเงินภายใน 1 ชั่วโมง" } });
    if (!marked.modifiedCount || !row.lineUserId || !origin || !lineConfigured()) continue;
    await pushLine(row.lineUserId, [{ type: "text", text: `⏰ คำขอ ${row._id} หมดเวลาการกันคิว 1 ชั่วโมงแล้วค่ะ สถานะเปลี่ยนเป็นยกเลิก จึงไม่สามารถชำระเงินเพื่อยืนยันคิวนี้ได้ หากยังต้องการเช่า กรุณาส่งคำขอใหม่หรือติดต่อร้านค่ะ` }]).catch(error => console.error("LINE expired hold notice failed:", error));
  }
  const waiting = await bookings.find({ status: { $in: ["new", "contacted"] }, waitlist: { $exists: true } }, { projection: { _id: 1, name: 1, start: 1, end: 1, schedule: 1, items: 1, createdAt: 1, lineUserId: 1, billToken: 1 } }).sort({ createdAt: 1 }).limit(50).toArray();
  let promoted = 0;
  for (const row of waiting) {
    const range = blockRange(row);
    const free = (await Promise.all([...new Set(row.items.map(item => item.id))].map(async id => (await getQueue(db, id, range.from, range.to, row._id)).every(day => day.remaining >= 1)))).every(Boolean);
    if (!free) continue;
    const holdUntil = new Date(Date.now() + holdMinutes * 60000);
    const result = await bookings.updateOne({ _id: row._id, waitlist: { $exists: true } }, { $set: { holdUntil, promotedAt: new Date() }, $unset: { waitlist: "" } });
    if (!result.modifiedCount) continue;
    promoted++;
    await audit(request, null, { action: "booking.waitlist_promoted", targetType: "booking", targetId: row._id, summary: `ถึงคิวจากคิวสำรอง · กันคิวให้ ${holdMinutes} นาทีเพื่อชำระเงิน`, actorEmail: "ระบบคิวอัตโนมัติ" }).catch(() => undefined);
    if (row.lineUserId && lineConfigured() && origin) {
      const billToken = row.billToken || randomBytes(18).toString("base64url");
      if (!row.billToken) await bookings.updateOne({ _id: row._id }, { $set: { billToken } });
      await pushLine(row.lineUserId, [{ type: "text", text: `🎉 ถึงคิวของคุณแล้วค่ะ คำขอ ${row._id}\nชุดที่รอคิวว่างแล้ว ร้านกันคิวให้ ${holdMinutes} นาที กรุณาชำระเงินภายในเวลานี้ ไม่เช่นนั้นสิทธิ์จะเลื่อนไปยังคิวถัดไป\nดูบิลได้ที่ ${origin}/bill/${billToken}` }]).catch(error => console.error("LINE waitlist notice failed:", error));
    }
  }
  return promoted;
}
