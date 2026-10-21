import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { thaiDay } from "@/lib/finance";
import { lineConfigured, pushLine } from "@/lib/line";
import { database } from "@/lib/mongodb";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";

type BookingDoc = { _id: string; name?: string; start: string; end: string; schedule?: ScheduleRecord; billToken?: string; lineUserId?: string; returnReminderSentAt?: Date };
const dayLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

// Vercel Cron calls this once a day (vercel.json) with Authorization: Bearer $CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!lineConfigured()) return Response.json({ error: "ยังไม่ได้ตั้งค่า LINE" }, { status: 503 });
  const tomorrow = thaiDay(new Date(Date.now() + 86400000));
  const bookings = (await database()).collection<BookingDoc>("bookingRequests");
  // Due back tomorrow, still out with the customer, and not reminded yet.
  const due = await bookings.find({ status: "confirmed", $or: [{ "schedule.returnDate": tomorrow }, { schedule: { $exists: false }, end: tomorrow }], shipment: { $exists: true }, returned: { $exists: false }, customerReturn: { $exists: false }, returnReminderSentAt: { $exists: false }, lineUserId: { $exists: true, $ne: "" } }, { projection: { _id: 1, name: 1, start: 1, end: 1, schedule: 1, billToken: 1, lineUserId: 1 } }).toArray();
  const origin = new URL(request.url).origin;
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
  return Response.json({ ok: true, due: tomorrow, sent, failed });
}
