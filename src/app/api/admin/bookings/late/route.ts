import { randomBytes, randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { shiftSchedule, type LateReturn } from "@/lib/extension";
import { ledgerDate, thaiDay, transactions, validDay } from "@/lib/finance";
import { lineConfigured, pushLine } from "@/lib/line";
import { database } from "@/lib/mongodb";
import { countUseDays, type ScheduleRecord } from "@/lib/schedule";
import { getStoreSettings } from "@/lib/store-settings";

type BookingDoc = { _id: string; status: string; schedule?: ScheduleRecord; items: { id: number }[]; shipment?: object; lateReturn?: LateReturn; lineUserId?: string; billToken?: string };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });

// "ส่งคืนล่าช้า": the day the customer really sent the piece back, the fine for the days past due,
// and the queue moved so the piece is not promised before it is back and prepared.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || body.id.length > 100 || !["record", "paid"].includes(body.action)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin(body.action === "paid" ? "payments" : "shipping");
  if (auth.error) return auth.error;
  const admin = auth.admin, db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.id }, { projection: { _id: 1, status: 1, schedule: 1, items: 1, shipment: 1, lateReturn: 1, lineUserId: 1, billToken: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  const log = (action: string, summary: string, changes: { field: string; before: unknown; after: unknown }[] = []) => audit(request, admin, { action, targetType: "booking", targetId: booking._id, summary, changes });

  if (body.action === "paid") {
    if (booking.lateReturn?.status !== "unpaid") return Response.json({ error: "ไม่มีค่าปรับที่รอชำระ" }, { status: 409 });
    if (body.paidOn !== undefined && !validDay(body.paidOn)) return Response.json({ error: "วันที่ชำระไม่ถูกต้อง" }, { status: 400 });
    const paidOn = body.paidOn || thaiDay(), now = new Date();
    const updated = await bookings.updateOne({ _id: booking._id, "lateReturn.status": "unpaid" }, { $set: { "lateReturn.status": "paid", "lateReturn.paidOn": paidOn, "lateReturn.paidByName": admin.name, updatedAt: now } });
    if (!updated.modifiedCount) return Response.json({ error: "มีผู้บันทึกรายการนี้ไปแล้ว" }, { status: 409 });
    await transactions(db).insertOne({ _id: randomUUID(), type: "income", category: "ค่าปรับ", amount: booking.lateReturn.fine, date: ledgerDate(paidOn), note: `ค่าปรับคืนช้า ${booking._id} (${booking.lateReturn.days} วัน)`, createdAt: now, createdBy: admin.email || admin.username, createdByName: admin.name, bookingId: booking._id, source: "late" });
    await log("booking.late_fine_paid", `ยืนยันรับค่าปรับคืนช้า ${money(booking.lateReturn.fine)} บาท`, [{ field: "paidOn", before: null, after: paidOn }]);
    return Response.json({ lateReturn: { ...booking.lateReturn, status: "paid", paidOn, paidByName: admin.name } });
  }

  if (booking.status !== "confirmed" || !booking.shipment || !booking.schedule) return Response.json({ error: "บันทึกคืนล่าช้าได้เฉพาะรายการที่ส่งชุดออกไปแล้ว" }, { status: 409 });
  if (booking.lateReturn && booking.lateReturn.status !== "unpaid") return Response.json({ error: "ชำระค่าปรับรายการนี้แล้ว แก้ไขไม่ได้" }, { status: 409 });
  // Re-recording replaces the earlier entry: measure from the original due day, then move the queue by the difference.
  const dueDate = booking.lateReturn?.dueDate ?? booking.schedule.returnDate, shifted = booking.lateReturn?.days ?? 0;
  if (!validDay(body.actualDate) || body.actualDate <= dueDate) return Response.json({ error: `วันที่คืนจริงต้องอยู่หลังกำหนดคืน ${day(dueDate)}` }, { status: 400 });
  if (body.actualDate > thaiDay()) return Response.json({ error: "วันที่คืนจริงต้องไม่เกินวันนี้" }, { status: 400 });
  if (typeof body.fine !== "number" || !Number.isFinite(body.fine) || body.fine < 0 || body.fine > 1000000) return Response.json({ error: "กรุณากรอกค่าปรับ" }, { status: 400 });
  const days = countUseDays(dueDate, body.actualDate) - 1, fine = Math.round(body.fine * 100) / 100, note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "", now = new Date();
  const lateReturn: LateReturn = { dueDate, actualDate: body.actualDate, days, fine, note, status: fine > 0 ? "unpaid" : "paid", createdAt: now, createdByName: admin.name };
  const schedule = shiftSchedule(booking.schedule, days - shifted);
  await bookings.updateOne({ _id: booking._id }, { $set: { lateReturn, schedule, updatedAt: now } });
  await log("booking.late_return", `ส่งคืนล่าช้า ${days} วัน (คืนจริง ${body.actualDate}) · ค่าปรับ ${money(fine)} บาท${note ? ` · ${note}` : ""}`, [{ field: "returnDate", before: booking.schedule.returnDate, after: schedule.returnDate }]);
  let lineNotified = false;
  if (fine > 0 && booking.lineUserId && lineConfigured()) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: booking._id }, { $set: { billToken } });
    const settings = await getStoreSettings();
    try { await pushLine(booking.lineUserId, [{ type: "text", text: `แจ้งค่าปรับส่งคืนล่าช้า คำขอ ${booking._id} ค่ะ\nกำหนดคืน ${day(dueDate)} · คืนจริง ${day(body.actualDate)} (ช้า ${days} วัน)\nค่าปรับวันละ ${settings.lateRates.lateFinePerDay} บาท รวม ${money(fine)} บาท\nดูรายละเอียดและบัญชีร้านได้ที่ ${new URL(request.url).origin}/bill/${billToken}` }]); lineNotified = true; } catch (error) { console.error("LINE late fine notice failed:", error); }
  }
  return Response.json({ lateReturn: { ...lateReturn, createdAt: now.toISOString() }, schedule, lineNotified });
}
