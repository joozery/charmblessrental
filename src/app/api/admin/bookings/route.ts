import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { randomBytes } from "node:crypto";
import { database } from "@/lib/mongodb";
import { lineConfigured, pushLine } from "@/lib/line";
import { getEffectiveAvailability } from "@/lib/availability-store";
import { audit, diff } from "@/lib/audit";
import { deposits, recordBookingPayment, thaiDay, validDay, voidBookingPayment } from "@/lib/finance";
import type { Permission } from "@/lib/permissions";
const statuses = ["new", "contacted", "confirmed", "cancelled"];
const conditions = ["good", "damaged", "missing"];
type Shipment = { carrier: string; trackingNumber: string; shippedAt: Date; by: string; byName: string };
type Returned = { at: Date; condition: string; note: string; by: string; byName: string };
type BookingDoc = { _id: string; status: string; method?: string; billToken?: string; payment?: "unpaid" | "paid"; lineUserId?: string; lineSentAt?: Date; quote?: Record<string, unknown>; name?: string; paidAt?: Date | null; updatedAt?: Date; updatedBy?: string; start: string; end: string; items: { id: number; name?: string }[]; shipment?: Shipment; returned?: Returned };
type QuoteInput = { rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string };
const validQuote = (quote: unknown): quote is QuoteInput => { if (!quote || typeof quote !== "object") return false; const value = quote as Record<string, unknown>; return ["rental", "deposit", "shipping"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0) && ["bank", "accountName", "accountNumber", "returnAddress", "returnPhone", "returnMethod"].every(key => typeof value[key] === "string" && (value[key] as string).length <= 500) && typeof value.qrImage === "string" && value.qrImage.length <= 2000; };
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max;
const actions: Record<string, Permission> = { saveQuote: "pricing", billLink: "bookings", sendLine: "bookings", setPayment: "payments", ship: "shipping", receiveReturn: "shipping" };
const quoteFields = ["rental", "deposit", "shipping", "bank", "accountName", "accountNumber", "qrImage", "returnAddress", "returnPhone", "returnMethod"];
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || body.id.length > 100 || (!statuses.includes(body.status) && !Object.hasOwn(actions, body.action)) || (body.action === "saveQuote" && !validQuote(body.quote)) || (body.action === "setPayment" && (typeof body.paid !== "boolean" || (body.paidOn !== undefined && !validDay(body.paidOn)))) || (body.action === "ship" && (!text(body.carrier, 60) || !text(body.trackingNumber, 60))) || (body.action === "receiveReturn" && (!conditions.includes(body.condition) || !text(body.note, 500)))) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin(body.action ? actions[body.action] : "bookings");
  if (auth.error) return auth.error;
  const admin = auth.admin, by = admin.email || admin.username;
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.id });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  const log = (action: string, summary: string, changes = [] as ReturnType<typeof diff>) => audit(request, admin, { action, targetType: "booking", targetId: booking._id, summary, changes });
  if (body.action === "billLink") {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: body.id }, { $set: { billToken, payment: booking.payment || "unpaid" } });
    return Response.json({ ok: true, billToken });
  }
  if (body.action === "sendLine") {
    if (!lineConfigured()) return Response.json({ error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN" }, { status: 503 });
    if (!booking.lineUserId) return Response.json({ error: "ลูกค้ายังไม่ได้ส่งเลขที่คำขอหรือเบอร์โทรใน LINE" }, { status: 409 });
    if (!booking.quote) return Response.json({ error: "กรุณากดบันทึกราคาในใบสรุปก่อนส่งบิล" }, { status: 409 });
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: body.id }, { $set: { billToken, payment: booking.payment || "unpaid" } });
    const origin = new URL(request.url).origin, billUrl = `${origin}/bill/${billToken}`;
    const imageUrl = `${billUrl}/image?v=${Date.now()}`;
    const message = { type: "text" as const, text: `ใบรายละเอียดการเช่า (${booking._id}) ของคุณ${booking.name ? " " + booking.name : ""} พร้อมแล้วค่ะ\nดูบิลและบันทึกไฟล์: ${billUrl}\n\nกรุณาตรวจสอบยอด โอนเงินตามยอดสุทธิ และส่งสลิปในแชทนี้นะคะ 🙏` };
    try { await pushLine(booking.lineUserId, origin.startsWith("https://") ? [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }, message] : [message]); } catch (error) { console.error("LINE push failed:", error); return Response.json({ error: "ส่งข้อความไม่สำเร็จ ลูกค้าอาจบล็อกบัญชีร้านหรือ token ไม่ถูกต้อง" }, { status: 502 }); }
    await bookings.updateOne({ _id: body.id }, { $set: { lineSentAt: new Date() } });
    await log("booking.bill_sent", "ส่งบิลทาง LINE");
    return Response.json({ ok: true, billToken });
  }
  if (body.action === "setPayment") {
    if (body.paid === (booking.payment === "paid")) return Response.json({ error: body.paid ? "รายการนี้ยืนยันชำระแล้ว" : "รายการนี้ยังไม่ได้ชำระ" }, { status: 409 });
    if (body.paid) {
      if (!booking.quote) return Response.json({ error: "กรุณาบันทึกราคาในใบสรุปก่อนยืนยันชำระเงิน" }, { status: 409 });
      if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
    } else {
      const deposit = await deposits(db).findOne({ _id: booking._id });
      if (deposit && deposit.status !== "held" && deposit.status !== "void") return Response.json({ error: "คืนเงินประกันของรายการนี้แล้ว จึงยกเลิกสถานะชำระไม่ได้" }, { status: 409 });
      if (!text(body.reason, 300) || !body.reason?.trim()) return Response.json({ error: "กรุณาระบุเหตุผลที่ยกเลิกสถานะชำระเงิน" }, { status: 400 });
    }
    const paidOn = body.paidOn || thaiDay();
    await bookings.updateOne({ _id: body.id }, { $set: { payment: body.paid ? "paid" : "unpaid", paidAt: body.paid ? new Date(`${paidOn}T12:00:00.000Z`) : null, updatedAt: new Date(), updatedBy: by } });
    if (body.paid) {
      const amounts = await recordBookingPayment(db, booking, admin, paidOn);
      await log("booking.payment_confirmed", `ยืนยันชำระเงิน · ค่าเช่า ${amounts.rental} · ค่าส่ง ${amounts.shipping} · เงินประกัน ${amounts.deposit} บาท`, [{ field: "payment", before: "unpaid", after: "paid" }, { field: "paidOn", before: null, after: paidOn }]);
    } else {
      await voidBookingPayment(db, booking._id, admin, body.reason.trim());
      await log("booking.payment_reverted", `ยกเลิกสถานะชำระเงิน: ${body.reason.trim()}`, [{ field: "payment", before: "paid", after: "unpaid" }]);
    }
    return Response.json({ ok: true, paidAt: body.paid ? `${paidOn}T12:00:00.000Z` : "" });
  }
  if (body.action === "saveQuote") {
    if (booking.payment === "paid" && ["rental", "deposit", "shipping"].some(key => booking.quote?.[key] !== body.quote[key])) return Response.json({ error: "รายการนี้ยืนยันชำระแล้ว หากต้องแก้ยอดเงิน กรุณายกเลิกสถานะชำระก่อน" }, { status: 409 });
    const quote = Object.fromEntries(quoteFields.map(key => [key, body.quote[key]]));
    await bookings.updateOne({ _id: body.id }, { $set: { quote: { ...quote, updatedAt: new Date(), updatedBy: by } } });
    const changes = diff(booking.quote, quote, quoteFields);
    if (changes.length) await log("booking.quote", booking.quote ? "แก้ไขราคาในใบสรุป" : "บันทึกราคาในใบสรุป", changes);
    return Response.json({ ok: true });
  }
  if (body.action === "ship") {
    if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
    if (booking.method !== "pickup" && !body.trackingNumber.trim()) return Response.json({ error: "กรุณากรอกเลขพัสดุ" }, { status: 400 });
    const shipment: Shipment = { carrier: body.carrier.trim(), trackingNumber: body.trackingNumber.trim(), shippedAt: new Date(), by, byName: admin.name };
    await bookings.updateOne({ _id: body.id }, { $set: { shipment, updatedAt: new Date(), updatedBy: by } });
    await log("booking.shipped", booking.method === "pickup" ? "ส่งมอบสินค้าให้ลูกค้าที่ร้าน" : `บันทึกเลขพัสดุ ${shipment.carrier} ${shipment.trackingNumber}`.trim(), diff(booking.shipment, shipment, ["carrier", "trackingNumber"]));
    return Response.json({ ok: true, shipment: { ...shipment, shippedAt: shipment.shippedAt.toISOString() } });
  }
  if (body.action === "receiveReturn") {
    if (!booking.shipment) return Response.json({ error: "กรุณาบันทึกการจัดส่งก่อนรับคืนสินค้า" }, { status: 409 });
    const returned: Returned = { at: new Date(), condition: body.condition, note: body.note.trim(), by, byName: admin.name };
    await bookings.updateOne({ _id: body.id }, { $set: { returned, updatedAt: new Date(), updatedBy: by } });
    await log("booking.returned", `รับคืนสินค้า · ${body.condition === "good" ? "สภาพปกติ" : body.condition === "damaged" ? "ชำรุด" : "สูญหาย/ไม่ครบ"}`, diff(booking.returned, returned, ["condition", "note"]));
    return Response.json({ ok: true, returned: { ...returned, at: returned.at.toISOString() } });
  }
  if (body.status === "confirmed" && booking.status !== "confirmed") {
    const days = (Date.parse(`${booking.end}T00:00:00Z`) - Date.parse(`${booking.start}T00:00:00Z`)) / 86400000;
    for (const item of booking.items) {
      const available = await getEffectiveAvailability(db, item.id, booking.start, booking.end);
      if (available.length < days || available.some(day => day.remaining < 1)) return Response.json({ error: `คิวของ ${item.name || "สินค้าบางรายการ"} ไม่พอหรือยังไม่ได้ตั้งจำนวนว่างครบทุกวัน` }, { status: 409 });
    }
  }
  await bookings.updateOne({ _id: body.id }, { $set: { status: body.status, updatedAt: new Date(), updatedBy: by } });
  if (body.status !== booking.status) await log("booking.status", "เปลี่ยนสถานะคำขอ", [{ field: "status", before: booking.status, after: body.status }]);
  return Response.json({ ok: true });
}
