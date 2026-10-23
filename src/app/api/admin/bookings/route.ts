import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { randomBytes } from "node:crypto";
import { database } from "@/lib/mongodb";
import { lineConfigured, pushLine } from "@/lib/line";
import { getQueue } from "@/lib/availability-store";
import { addDays, blockRange, returnDay, type ScheduleRecord } from "@/lib/schedule";
import type { BookingVerification } from "@/lib/identity";
import { audit, diff } from "@/lib/audit";
import { deposits, recordBookingPayment, thaiDay, validDay, voidBookingPayment } from "@/lib/finance";
import type { Permission } from "@/lib/permissions";
import { setUnitStatuses } from "@/lib/product-store";
import { unitStatusLabels, type UnitStatus } from "@/lib/products";
import { assignUnits, validUnitPicks } from "@/lib/rental-units";
import { cleanCode, customerDiscount, discountCoupons, validCoupon } from "@/lib/discounts";
import { claimBill } from "@/lib/bill-owner";
const statuses = ["new", "contacted", "confirmed", "cancelled"];
const conditions = ["good", "damaged", "missing"];
type Shipment = { carrier: string; trackingNumber: string; shippedAt: Date; by: string; byName: string };
type Returned = { at: Date; condition: string; note: string; by: string; byName: string };
type CustomerReturn = { carrier: string; trackingNumber: string; at: Date };
type BookingDoc = { _id: string; status: string; method?: string; billToken?: string; payment?: "unpaid" | "paid"; lineUserId?: string; lineSentAt?: Date; discountCode?: string; quote?: Record<string, unknown>; name?: string; paidAt?: Date | null; updatedAt?: Date; updatedBy?: string; start: string; end: string; items: { id: number; name?: string; unitSku?: string }[]; shipment?: Shipment; returned?: Returned; customerReturn?: CustomerReturn; schedule?: ScheduleRecord; verification?: BookingVerification };
// A returned piece is not rentable until it has been inspected, washed or repaired and an admin confirms it is ready.
const afterReturn: Record<string, UnitStatus> = { good: "inspection", damaged: "repair", missing: "unavailable" };
const withUnit = <T extends { unitSku?: string }>(item: T, sku: string) => { const rest = { ...item }; delete rest.unitSku; return sku ? { ...rest, unitSku: sku } : rest; };
const dayLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
type QuoteInput = { rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string; rentalBeforeDiscount?: number; discountAmount?: number; discountPercent?: number; discountLabel?: string; discountCode?: string };
const validQuote = (quote: unknown): quote is QuoteInput => { if (!quote || typeof quote !== "object") return false; const value = quote as Record<string, unknown>; return ["rental", "deposit", "shipping"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0) && ["bank", "accountName", "accountNumber", "returnAddress", "returnPhone", "returnMethod"].every(key => typeof value[key] === "string" && (value[key] as string).length <= 500) && typeof value.qrImage === "string" && value.qrImage.length <= 2000; };
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max;
const actions: Record<string, Permission> = { saveQuote: "pricing", billLink: "bookings", sendLine: "bookings", setPayment: "payments", ship: "shipping", receiveReturn: "shipping" };
const quoteFields = ["rental", "deposit", "shipping", "bank", "accountName", "accountNumber", "qrImage", "returnAddress", "returnPhone", "returnMethod", "rentalBeforeDiscount", "discountAmount", "discountPercent", "discountLabel", "discountCode"];
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
    const message = { type: "text" as const, text: `ใบรายละเอียดการเช่า (${booking._id}) ของคุณ${booking.name ? " " + booking.name : ""} พร้อมแล้วค่ะ\nดูบิลและบันทึกไฟล์: ${billUrl}\n\nกรุณาตรวจสอบยอด โอนเงินตามยอดสุทธิ และส่งสลิปในแชทนี้นะคะ 🙏${booking.verification?.mode === "identity" && booking.verification.status !== "approved" ? `\n\nคำขอนี้ไม่วางเงินมัดจำ รบกวนยืนยันตัวตน (บัตรประชาชน + แคปหน้า Instagram เต็มหน้าจอ + ที่อยู่) ได้ที่ลิงก์เดียวกันนี้ก่อนวันจัดส่งค่ะ` : ""}` };
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
      if (deposit && deposit.status !== "held" && deposit.status !== "void") return Response.json({ error: "คืนเงินมัดจำของรายการนี้แล้ว จึงยกเลิกสถานะชำระไม่ได้" }, { status: 409 });
      if (!text(body.reason, 300) || !body.reason?.trim()) return Response.json({ error: "กรุณาระบุเหตุผลที่ยกเลิกสถานะชำระเงิน" }, { status: 400 });
    }
    const paidOn = body.paidOn || thaiDay();
    await bookings.updateOne({ _id: body.id }, { $set: { payment: body.paid ? "paid" : "unpaid", paidAt: body.paid ? new Date(`${paidOn}T12:00:00.000Z`) : null, updatedAt: new Date(), updatedBy: by }, ...(body.paid ? { $unset: { slipReview: "" } } : {}) });
    if (body.paid) {
      const amounts = await recordBookingPayment(db, booking, admin, paidOn);
      await log("booking.payment_confirmed", `ยืนยันชำระเงิน · ค่าเช่า ${amounts.rental} · ค่าส่ง ${amounts.shipping} · เงินมัดจำ ${amounts.deposit} บาท`, [{ field: "payment", before: "unpaid", after: "paid" }, { field: "paidOn", before: null, after: paidOn }]);
    } else {
      await voidBookingPayment(db, booking._id, admin, body.reason.trim());
      await log("booking.payment_reverted", `ยกเลิกสถานะชำระเงิน: ${body.reason.trim()}`, [{ field: "payment", before: "paid", after: "unpaid" }]);
    }
    return Response.json({ ok: true, paidAt: body.paid ? `${paidOn}T12:00:00.000Z` : "" });
  }
  if (body.action === "saveQuote") {
    if (booking.payment === "paid" && ["rental", "deposit", "shipping"].some(key => booking.quote?.[key] !== body.quote[key])) return Response.json({ error: "รายการนี้ยืนยันชำระแล้ว หากต้องแก้ยอดเงิน กรุณายกเลิกสถานะชำระก่อน" }, { status: 409 });
    const before = typeof body.quote.rentalBeforeDiscount === "number" ? body.quote.rentalBeforeDiscount : body.quote.rental;
    const code = cleanCode(body.quote.discountCode || booking.discountCode), coupon = code ? await discountCoupons(db).findOne({ code }) : null;
    if (code && !validCoupon(coupon)) return Response.json({ error: "โค้ดส่วนลดไม่ถูกต้อง หมดอายุ หรือใช้ครบแล้ว" }, { status: 400 });
    const customer = booking.lineUserId ? await db.collection<{ _id: string; bookingCount?: number; completedCount?: number; reviewCount?: number }>("customers").findOne({ _id: booking.lineUserId }) : null;
    const loyalty = customerDiscount(customer?.completedCount ?? customer?.bookingCount ?? 0, customer?.reviewCount ?? 0);
    const percent = Math.min(100, (coupon?.percent || 0) + loyalty.percent), discountAmount = Math.round(before * percent / 100 * 100) / 100;
    const quote = Object.fromEntries(quoteFields.map(key => [key, body.quote[key]])) as QuoteInput;
    quote.rentalBeforeDiscount = before; quote.discountPercent = percent; quote.discountAmount = discountAmount; quote.rental = Math.max(0, Math.round((before - discountAmount) * 100) / 100); quote.discountLabel = [loyalty.label, coupon?.label].filter(Boolean).join(" + "); quote.discountCode = coupon?.code || "";
    await bookings.updateOne({ _id: body.id }, { $set: { quote: { ...quote, updatedAt: new Date(), updatedBy: by } } });
    await claimBill(db, booking._id, admin);
    const changes = diff(booking.quote, quote, quoteFields);
    if (changes.length) await log("booking.quote", booking.quote ? "แก้ไขราคาในใบสรุป" : "บันทึกราคาในใบสรุป", changes);
    if (coupon && booking.quote?.discountCode !== coupon.code) await discountCoupons(db).updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 }, $set: { updatedAt: new Date() } });
    return Response.json({ ok: true, quote });
  }
  if (body.action === "ship") {
    if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
    if (booking.method !== "pickup" && !body.trackingNumber.trim()) return Response.json({ error: "กรุณากรอกเลขพัสดุ" }, { status: 400 });
    if (booking.returned) return Response.json({ error: "รับคืนสินค้ารายการนี้แล้ว" }, { status: 409 });
    const picks = body.units === undefined ? booking.items.map(item => item.unitSku || "") : await validUnitPicks(db, booking, body.units);
    if (!picks) return Response.json({ error: "ชิ้นสินค้าที่เลือกไม่ถูกต้อง กรุณาโหลดหน้าใหม่" }, { status: 400 });
    // No deposit was taken, so the piece only leaves once the customer's identity has been checked.
    if (!booking.shipment && booking.verification?.mode === "identity" && booking.verification.status !== "approved") return Response.json({ error: "ลูกค้าเลือกไม่วางเงินมัดจำ ต้องตรวจเอกสารยืนยันตัวตนให้ผ่านก่อนจัดส่ง" }, { status: 409 });
    const items = booking.items.map((item, index) => withUnit(item, picks[index]));
    const released = booking.items.map(item => item.unitSku).filter((sku): sku is string => !!sku && !picks.includes(sku));
    const shipment: Shipment = { carrier: body.carrier.trim(), trackingNumber: body.trackingNumber.trim(), shippedAt: booking.shipment?.shippedAt || new Date(), by, byName: admin.name };
    await bookings.updateOne({ _id: body.id }, { $set: { shipment, items, updatedAt: new Date(), updatedBy: by } });
    const before = await setUnitStatuses(db, [...released.map(sku => ({ sku, status: "available" as const })), ...picks.filter(Boolean).map(sku => ({ sku, status: "rented" as const }))]);
    const changes = [...diff(booking.shipment, shipment, ["carrier", "trackingNumber"]), ...diff({ units: booking.items.map(item => item.unitSku || "") }, { units: picks })];
    await log("booking.shipped", `${booking.method === "pickup" ? "ส่งมอบสินค้าให้ลูกค้าที่ร้าน" : `บันทึกเลขพัสดุ ${shipment.carrier} ${shipment.trackingNumber}`.trim()}${picks.some(Boolean) ? ` · ชิ้น ${picks.filter(Boolean).join(", ")}` : ""}`, changes);
    for (const [sku, previous] of before) if (previous.status !== (released.includes(sku) ? "available" : "rented")) await audit(request, admin, { action: "product.unit", targetType: "product", targetId: String(previous.productId), summary: `${sku} ${released.includes(sku) ? "ถูกเปลี่ยนออกจาก" : "ส่งให้ลูกค้า"} คำขอ ${booking._id}`, changes: [{ field: "status", before: previous.status, after: released.includes(sku) ? "available" : "rented" }] });
    // Tell the customer on first dispatch, or when the tracking number changes.
    let lineNotified = false;
    if (booking.lineUserId && lineConfigured() && (!booking.shipment || booking.shipment.trackingNumber !== shipment.trackingNumber || booking.shipment.carrier !== shipment.carrier)) {
      const billToken = booking.billToken || randomBytes(18).toString("base64url");
      if (!booking.billToken) await bookings.updateOne({ _id: body.id }, { $set: { billToken } });
      const billUrl = `${new URL(request.url).origin}/bill/${billToken}`;
      const text = booking.method === "pickup"
        ? `ส่งมอบสินค้าคำขอ ${booking._id} เรียบร้อยแล้วค่ะ\nกำหนดส่งคืน ${dayLabel(returnDay(booking))}\nเมื่อส่งคืนแล้ว แจ้งเลขพัสดุได้ที่ ${billUrl}`
        : `จัดส่งสินค้าคำขอ ${booking._id} แล้วค่ะ 📦\n${shipment.carrier} ${shipment.trackingNumber}\nกำหนดส่งคืน ${dayLabel(returnDay(booking))}\nติดตามสถานะและแจ้งเลขพัสดุตอนส่งคืนได้ที่ ${billUrl}`;
      try { await pushLine(booking.lineUserId, [{ type: "text", text }]); lineNotified = true; } catch (error) { console.error("LINE shipping notice failed:", error); }
    }
    return Response.json({ ok: true, lineNotified, items, shipment: { ...shipment, shippedAt: shipment.shippedAt.toISOString() } });
  }
  if (body.action === "receiveReturn") {
    if (!booking.shipment) return Response.json({ error: "กรุณาบันทึกการจัดส่งก่อนรับคืนสินค้า" }, { status: 409 });
    if (booking.returned) return Response.json({ error: "รับคืนสินค้ารายการนี้แล้ว" }, { status: 409 });
    const picks = body.units === undefined ? booking.items.map(item => item.unitSku || "") : await validUnitPicks(db, booking, body.units);
    if (!picks || picks.some((sku, index) => booking.items[index].unitSku && sku !== booking.items[index].unitSku)) return Response.json({ error: "ชิ้นสินค้าที่เลือกไม่ถูกต้อง กรุณาโหลดหน้าใหม่" }, { status: 400 });
    const items = booking.items.map((item, index) => withUnit(item, picks[index]));
    const returned: Returned = { at: new Date(), condition: body.condition, note: body.note.trim(), by, byName: admin.name };
    const status = afterReturn[body.condition];
    await bookings.updateOne({ _id: body.id }, { $set: { returned, items, updatedAt: new Date(), updatedBy: by } });
    const before = await setUnitStatuses(db, picks.filter(Boolean).map(sku => ({ sku, status, ...(body.note.trim() ? { note: `คืนจาก ${booking._id}: ${body.note.trim()}`.slice(0, 500) } : {}) })));
    await log("booking.returned", `รับคืนสินค้า · ${body.condition === "good" ? "สภาพปกติ" : body.condition === "damaged" ? "ชำรุด" : "สูญหาย/ไม่ครบ"}${before.size ? ` · ${[...before.keys()].join(", ")} → ${unitStatusLabels[status]}` : ""}`, diff(booking.returned, returned, ["condition", "note"]));
    for (const [sku, previous] of before) await audit(request, admin, { action: "product.unit", targetType: "product", targetId: String(previous.productId), summary: `${sku} รับคืนจากคำขอ ${booking._id}`, changes: [{ field: "status", before: previous.status, after: status }] });
    return Response.json({ ok: true, items, returned: { ...returned, at: returned.at.toISOString() } });
  }
  if (body.status === "confirmed" && booking.status !== "confirmed") {
    // The piece is out from the shipping day to the end of the gap, not only on the days of use.
    const range = blockRange(booking);
    for (const item of booking.items) {
      const full = (await getQueue(db, item.id, range.from, range.to, booking._id)).find(day => day.remaining < 1);
      if (full) return Response.json({ error: `คิวของ ${item.name || "สินค้าบางรายการ"} เต็มวันที่ ${dayLabel(full.date)} (ช่วงที่ต้องใช้ชุด ${dayLabel(range.from)} – ${dayLabel(addDays(range.to, -1))} รวมวันจัดส่งและ Gap)` }, { status: 409 });
    }
  }
  // Confirming reserves a piece per item, so the customer can follow its preparation.
  const items = body.status === "confirmed" ? await assignUnits(db, booking) : booking.items;
  await bookings.updateOne({ _id: body.id }, { $set: { status: body.status, items, updatedAt: new Date(), updatedBy: by } });
  if (body.status !== booking.status) await log("booking.status", "เปลี่ยนสถานะคำขอ", [{ field: "status", before: booking.status, after: body.status }]);
  return Response.json({ ok: true, items });
}
