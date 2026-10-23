import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { thaiDay } from "@/lib/finance";
import { lineConfigured, pushLine } from "@/lib/line";
import { database } from "@/lib/mongodb";
import { addDays, returnDay, type ScheduleRecord } from "@/lib/schedule";
import type { BookingVerification } from "@/lib/identity";
import { purgeIdentity } from "@/lib/identity-store";
import { getStoreSettings } from "@/lib/store-settings";
import { promoteWaitlist } from "@/lib/waitlist";
import { requestOrigin } from "@/lib/request-origin";

type BookingDoc = { _id: string; name?: string; start: string; end: string; schedule?: ScheduleRecord; billToken?: string; lineUserId?: string; returnReminderSentAt?: Date; lateNoticeSentAt?: Date; verification?: BookingVerification };
const dayLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

// Vercel Cron calls this once a day (vercel.json) with Authorization: Bearer $CRON_SECRET:
// return reminders, reminders to send ID documents before shipping, and deleting expired ID documents.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = await database(), settings = await getStoreSettings();
  await promoteWaitlist(db, request);
  const purged = await purgeIdentity(db, settings.verification);
  for (const bookingId of purged.bookings) await audit(request, null, { action: "identity.deleted", targetType: "booking", targetId: bookingId, summary: `ลบเอกสารยืนยันตัวตนอัตโนมัติ (ครบ ${settings.verification.deleteAfterDays} วันหลังจบการเช่า)`, actorEmail: "ระบบอัตโนมัติ" }).catch(() => undefined);
  if (!lineConfigured()) return Response.json({ ok: true, purged: purged.removed, error: "ยังไม่ได้ตั้งค่า LINE" });
  const tomorrow = thaiDay(new Date(Date.now() + 86400000));
  const bookings = db.collection<BookingDoc>("bookingRequests");
  // Due back tomorrow, still out with the customer, and not reminded yet.
  const due = await bookings.find({ status: "confirmed", $or: [{ "schedule.returnDate": tomorrow }, { schedule: { $exists: false }, end: tomorrow }], shipment: { $exists: true }, returned: { $exists: false }, customerReturn: { $exists: false }, returnReminderSentAt: { $exists: false }, lineUserId: { $exists: true, $ne: "" } }, { projection: { _id: 1, name: 1, start: 1, end: 1, schedule: 1, billToken: 1, lineUserId: 1 } }).toArray();
  const origin = requestOrigin(request);
  let sent = 0, failed = 0;
  for (const booking of due) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    const text = `แจ้งเตือนกำหนดส่งคืนสินค้า ⏰\nคำขอ ${booking._id}${booking.name ? ` ของคุณ ${booking.name}` : ""} ครบกำหนดส่งคืนพรุ่งนี้ ${dayLabel(returnDay(booking))}\nเมื่อส่งคืนแล้ว รบกวนแจ้งขนส่งและเลขพัสดุที่ ${origin}/bill/${billToken}\nขอบคุณค่ะ 🙏`;
    try {
      await pushLine(booking.lineUserId!, [{ type: "text", text }]);
      await bookings.updateOne({ _id: booking._id }, { $set: { billToken, returnReminderSentAt: new Date() } });
      await audit(request, null, { action: "booking.return_reminder", targetType: "booking", targetId: booking._id, summary: `ส่ง LINE เตือนกำหนดส่งคืน ${dayLabel(returnDay(booking))}`, actorEmail: "ระบบแจ้งเตือนอัตโนมัติ" });
      sent++;
    } catch (error) { console.error("Return reminder failed:", booking._id, error); failed++; }
  }
  // The day after the return day: still not back and not reported on its way, so ask once (an extension resets this).
  const late = await bookings.find({ status: "confirmed", $or: [{ "schedule.returnDate": { $lt: thaiDay() } }, { schedule: { $exists: false }, end: { $lt: thaiDay() } }], shipment: { $exists: true }, returned: { $exists: false }, customerReturn: { $exists: false }, lateNoticeSentAt: { $exists: false }, lineUserId: { $exists: true, $ne: "" } }, { projection: { _id: 1, name: 1, start: 1, end: 1, schedule: 1, billToken: 1, lineUserId: 1 } }).toArray();
  let lateSent = 0;
  for (const booking of late) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    const text = `สวัสดีค่ะ คำขอ ${booking._id}${booking.name ? ` ของคุณ ${booking.name}` : ""} ครบกำหนดส่งคืนชุดเมื่อ ${dayLabel(returnDay(booking))} ร้านยังไม่ได้รับแจ้งการส่งคืนค่ะ 🙏\n\nถ้าส่งคืนแล้ว รบกวนแจ้งขนส่งและเลขพัสดุที่ ${origin}/bill/${billToken}\nถ้าจะคืนช้าหรืออยากเช่าต่อ ทักแชทนี้ได้เลยค่ะ (มีค่าเช่าเพิ่มตามจำนวนวัน)`;
    try {
      await pushLine(booking.lineUserId!, [{ type: "text", text }]);
      await bookings.updateOne({ _id: booking._id }, { $set: { billToken, lateNoticeSentAt: new Date() } });
      await audit(request, null, { action: "booking.late_notice", targetType: "booking", targetId: booking._id, summary: `ส่ง LINE ถามลูกค้า: เลยกำหนดคืน ${dayLabel(returnDay(booking))}`, actorEmail: "ระบบแจ้งเตือนอัตโนมัติ" });
      lateSent++;
    } catch (error) { console.error("Late return notice failed:", booking._id, error); failed++; }
  }
  // Two days before the shop must ship, nudge customers who still owe their ID documents.
  const today = thaiDay(), soon = addDays(today, 2);
  const missing = await bookings.find({ status: { $ne: "cancelled" }, "verification.mode": "identity", "verification.status": { $in: ["pending", "rejected"] }, "verification.remindedAt": { $exists: false }, "schedule.ship": { $gte: today, $lte: soon }, shipment: { $exists: false }, lineUserId: { $exists: true, $ne: "" } }, { projection: { _id: 1, billToken: 1, lineUserId: 1, schedule: 1, verification: 1 } }).toArray();
  let identitySent = 0;
  for (const booking of missing) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    try {
      await pushLine(booking.lineUserId!, [{ type: "text", text: `อีกไม่กี่วันร้านจะจัดส่งคำขอ ${booking._id} (${dayLabel(booking.schedule!.ship)}) แต่ยังไม่ได้รับเอกสารยืนยันตัวตนค่ะ 🙏\nรบกวนส่งรูปบัตรประชาชน + แคปหน้า Instagram เต็มหน้าจอ + ที่อยู่ ได้ที่ ${origin}/bill/${billToken}\nหากไม่สะดวก เปลี่ยนเป็นวางเงินมัดจำได้ ทักร้านในแชทนี้ได้เลยค่ะ` }]);
      await bookings.updateOne({ _id: booking._id }, { $set: { billToken, "verification.remindedAt": new Date() } });
      identitySent++;
    } catch (error) { console.error("Identity reminder failed:", booking._id, error); failed++; }
  }
  return Response.json({ ok: true, due: tomorrow, sent, lateSent, identitySent, purged: purged.removed, failed });
}
