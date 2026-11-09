import { randomBytes, randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { grantCredit } from "@/lib/customer-credits";
import { effectivePricing, priceFor } from "@/lib/pricing";
import { database } from "@/lib/mongodb";
import { addDays, planFor, scheduleRecord, type ReturnMethod } from "@/lib/schedule";
import { getStoreSettings } from "@/lib/store-settings";
import { adminUseQueue } from "@/lib/admin-availability";
import type { Product } from "@/lib/products";
import { setUnitStatuses } from "@/lib/product-store";
import { lineConfigured, pushLine } from "@/lib/line";
import type { Extension } from "@/lib/extension";
import { requestOrigin } from "@/lib/request-origin";

type InputItem = { id: number; quantity: number; rental?: number; deposit?: number; note?: string };
type BookingItem = { id: number; name: string; sku: string; image: string; dailyRate: number | null; unitSku?: string; quantity?: number; depositPrice?: number; rentalPrice?: number | null };
type Booking = { _id: string; status: string; name?: string; phone?: string; address?: string; pin?: string; note?: string; payment?: "unpaid" | "paid"; lineUserId?: string; lineOa?: string; billToken?: string; start: string; end: string; days: number; method: string; deliveryFee?: number; estimatedTotal?: number | null; returned?: object; shipment?: object; schedule?: ReturnType<typeof scheduleRecord>; items: BookingItem[]; quote?: { rental?: number; deposit?: number; shipping?: number; rentalBeforeDiscount?: number; discountAmount?: number; discountPercent?: number; discountLabel?: string; discountCode?: string }; extensions?: Extension[] };
const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: unknown; name?: unknown; phone?: unknown; address?: unknown; pin?: unknown; note?: unknown; method?: unknown; returnMethod?: unknown; rental?: unknown; deposit?: unknown; shipping?: unknown; start?: unknown; end?: unknown; items?: unknown; penalty?: { amount?: unknown; reason?: unknown } } | null;
  if (!body || typeof body.id !== "string" || !validDate(body.start) || !validDate(body.end) || (body.end as string) < (body.start as string) || !Array.isArray(body.items) || !body.items.length) return Response.json({ error: "กรุณาระบุวันและสินค้าให้ครบ" }, { status: 400 });
  const rawItems = body.items as Array<Record<string, unknown>>;
  const inputs = rawItems.map(item => ({ id: Number(item?.id), quantity: Number(item?.quantity), rental: Number(item?.rental), deposit: Number(item?.deposit) || 0, note: typeof item?.note === "string" ? item.note : "" })).filter(item => Number.isSafeInteger(item.id) && item.id > 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 50 && Number.isFinite(item.rental) && item.rental >= 0 && Number.isFinite(item.deposit) && item.deposit >= 0) as InputItem[];
  if (inputs.length !== body.items.length || new Set(inputs.map(item => item.id)).size !== inputs.length) return Response.json({ error: "รายการสินค้าไม่ถูกต้องหรือมีสินค้าซ้ำ" }, { status: 400 });
  const auth = await requireAdmin("bookings"); if (auth.error) return auth.error;
  const db = await database(), bookings = db.collection<Booking>("bookingRequests"), booking = await bookings.findOne({ _id: body.id });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  if (booking.shipment) return Response.json({ error: "จัดส่งสินค้าแล้ว แก้ไขสินค้าและวันเช่าไม่ได้ กรุณาใช้ปุ่มขยายวันเช่าแทน" }, { status: 409 });
  if (booking.status === "cancelled" || booking.returned || booking.extensions?.some(item => item.status === "unpaid")) return Response.json({ error: "รายการนี้ยังแก้ไขไม่ได้ กรุณาจัดการบิลค้างหรือรับคืนสินค้าแล้ว" }, { status: 409 });
  const penaltyAmount = body.penalty?.amount === undefined || body.penalty?.amount === "" ? 0 : Number(body.penalty.amount);
  const penaltyReason = typeof body.penalty?.reason === "string" ? body.penalty.reason.trim().slice(0, 500) : "";
  if (body.penalty && (!Number.isFinite(penaltyAmount) || penaltyAmount <= 0 || penaltyAmount > 1000000 || !penaltyReason)) return Response.json({ error: "กรุณาระบุค่าปรับและเหตุผลให้ถูกต้อง" }, { status: 400 });
  const settings = await getStoreSettings(), products = await db.collection<Product>("products").find({ id: { $in: inputs.map(item => item.id) }, active: { $ne: false } }).toArray();
  if (products.length !== inputs.length) return Response.json({ error: "มีสินค้าที่ไม่พร้อมให้เช่า" }, { status: 409 });
  for (const product of products) {
    const input = inputs.find(item => item.id === product.id)!;
    const full = (await adminUseQueue(db, product.id, body.start as string, addDays(body.end as string, 1), booking._id)).find(item => item.remaining < input.quantity);
    if (full) return Response.json({ error: `${product.thai || product.name} มีสินค้าไม่พอในวันที่ ${full.date}` }, { status: 409 });
  }
  const returnMethod: ReturnMethod = body.returnMethod === "parcel" || body.returnMethod === "messenger" || body.returnMethod === "shop" ? body.returnMethod : booking.schedule?.returnMethod || "parcel";
  const start = body.start as string, end = body.end as string;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const method = typeof body.method === "string" && (body.method === "pickup" || body.method === "messenger" || settings.shippingOptions.some(option => option.id === body.method)) ? body.method : booking.method;
  const plans = products.map(product => planFor(settings, start, end, method, returnMethod, product.gapDays ?? settings.schedule.gap[returnMethod]));
  const plan = plans.reduce((longest, current) => current.ready > longest.ready ? current : longest, plans[0]);
  const items = products.map(product => { const input = inputs.find(item => item.id === product.id)!; const pricing = effectivePricing(product, settings.rentalPricing, settings.extraDayRates); const tableRental = priceFor(pricing, days); const previous = booking.items.find(item => item.id === product.id); return { id: product.id, name: product.thai || product.name, sku: product.sku || "", image: product.images?.[0] || product.image || "", dailyRate: product.dailyRate, ...(previous?.unitSku ? { unitSku: previous.unitSku } : {}), rentalPrice: input.rental ?? tableRental, depositPrice: input.deposit ?? product.deposit ?? 0, quantity: input.quantity, note: input.note || "", stock: product.stock ?? 1 }; });
  const calculatedRental = items.reduce((sum, item) => sum + (item.rentalPrice || 0) * item.quantity, 0), calculatedDeposit = items.reduce((sum, item) => sum + (item.depositPrice || 0) * item.quantity, 0);
  const schedule = scheduleRecord(plan, returnMethod), now = new Date();
  const penaltyExtension: Extension | undefined = penaltyAmount > 0 ? { id: randomUUID(), fromEnd: booking.end, toEnd: booking.end, addedDays: 0, amount: Math.round(penaltyAmount * 100) / 100, status: "unpaid", createdAt: now, createdByName: auth.admin.name, billToken: randomBytes(18).toString("base64url"), dueAt: new Date(now.getTime() + 3600000), chargeType: "penalty", note: penaltyReason } : undefined;
  const nextSkus = new Set(items.map(item => item.unitSku).filter((sku): sku is string => !!sku));
  const releasedSkus = booking.items.map(item => item.unitSku).filter((sku): sku is string => !!sku && !nextSkus.has(sku));
  if (releasedSkus.length) await setUnitStatuses(db, releasedSkus.map(sku => ({ sku, status: "available" as const })));
  const discountPercent = booking.quote?.discountPercent || 0, discountAmount = Math.round(calculatedRental * discountPercent / 100 * 100) / 100, discountedRental = Math.max(0, Math.round((calculatedRental - discountAmount) * 100) / 100);
  const rental = typeof body.rental === "number" && Number.isFinite(body.rental) && body.rental >= 0 ? Math.round(body.rental * 100) / 100 : discountedRental;
  const deposit = typeof body.deposit === "number" && Number.isFinite(body.deposit) && body.deposit >= 0 ? Math.round(body.deposit * 100) / 100 : calculatedDeposit;
  const shipping = typeof body.shipping === "number" && Number.isFinite(body.shipping) && body.shipping >= 0 ? Math.round(body.shipping * 100) / 100 : (booking.quote?.shipping ?? booking.deliveryFee ?? 0);
  const details = { name: typeof body.name === "string" ? body.name.trim().slice(0, 120) : booking.name || "", phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : booking.phone || "", address: typeof body.address === "string" ? body.address.trim().slice(0, 500) : booking.address || "", pin: typeof body.pin === "string" ? body.pin.trim().slice(0, 500) : booking.pin || "", note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : booking.note || "", method };
  if (!details.name || !details.phone) return Response.json({ error: "กรุณากรอกชื่อลูกค้าและเบอร์โทรศัพท์" }, { status: 400 });
  if (details.method !== "pickup" && !details.address) return Response.json({ error: "กรุณากรอกที่อยู่จัดส่ง" }, { status: 400 });
  if (booking.payment !== "paid") {
    const quote = booking.quote ? { ...booking.quote, rental, deposit, shipping, rentalBeforeDiscount: calculatedRental, discountAmount, discountPercent } : booking.quote;
    await bookings.updateOne({ _id: booking._id }, { $set: { ...details, start, end, days, schedule, items, deliveryFee: shipping, ...(quote ? { quote } : {}), estimatedTotal: rental + deposit + shipping, updatedAt: now, updatedBy: auth.admin.email || auth.admin.username }, ...(penaltyExtension ? { $push: { extensions: penaltyExtension } } : {}) });
    await audit(request, auth.admin, { action: "booking.modified", targetType: "booking", targetId: booking._id, summary: "แก้ไขสินค้าและวันเช่าก่อนชำระเงิน" });
    return Response.json({ ok: true, ...details, items, start, end, days, schedule, deliveryFee: shipping, estimatedTotal: rental + deposit + shipping, quote, penalty: penaltyExtension });
  }
  const oldTotal = (booking.quote?.rental || 0) + (booking.quote?.deposit || 0) + (booking.quote?.shipping || booking.deliveryFee || 0), newTotal = rental + deposit + shipping, difference = Math.round((newTotal - oldTotal) * 100) / 100;
  // A paid booking may not have a LINE link yet. Create a temporary customer key so a refund difference can still be recorded.
  if (difference < 0 && !booking.lineUserId) {
    const pendingCustomerId = `pending:${booking._id}`;
    await db.collection<{ _id: string; lineUserId: string; lineName: string; name: string; phone: string; bookingCount: number; completedCount: number; creditBalance: number; createdAt: Date; updatedAt: Date }>("customers").updateOne({ _id: pendingCustomerId }, { $setOnInsert: { _id: pendingCustomerId, lineUserId: pendingCustomerId, lineName: "ยังไม่เชื่อม LINE", name: booking.name || "", phone: booking.phone || "", bookingCount: 0, completedCount: 0, creditBalance: 0, createdAt: now }, $set: { updatedAt: now } }, { upsert: true });
    booking.lineUserId = pendingCustomerId;
  }
  if (difference < 0 && !booking.lineUserId) return Response.json({ error: "รายการนี้ยังไม่เชื่อม LINE จึงยังบันทึกเครดิตส่วนต่างไม่ได้" }, { status: 409 });
  const extension: Extension | undefined = difference > 0 ? { id: randomUUID(), fromEnd: booking.end, toEnd: end, addedDays: Math.max(0, days - booking.days), amount: difference, status: "unpaid", createdAt: now, createdByName: auth.admin.name, billToken: randomBytes(18).toString("base64url"), dueAt: new Date(now.getTime() + 3600000), chargeType: "standard", note: "บิลส่วนต่างจากการแก้ไขสินค้า/วันเช่า" } : undefined;
  const extensions = [extension, penaltyExtension].filter((item): item is Extension => !!item);
  if (difference < 0 && booking.lineUserId) await grantCredit(db, { customerId: booking.lineUserId, amount: Math.abs(difference), reason: "ส่วนต่างจากการแก้ไขสินค้า/วันเช่า", bookingId: booking._id, billToken: booking.billToken, createdBy: auth.admin.email || auth.admin.username, createdByName: auth.admin.name });
  await bookings.updateOne({ _id: booking._id }, { $set: { ...details, start, end, days, schedule, items, deliveryFee: shipping, estimatedTotal: newTotal, updatedAt: now, updatedBy: auth.admin.email || auth.admin.username }, ...(extensions.length ? { $push: { extensions: { $each: extensions } } } : {}) });
  await audit(request, auth.admin, { action: "booking.modified", targetType: "booking", targetId: booking._id, summary: `แก้ไขสินค้า/วันเช่าหลังชำระเงิน · ส่วนต่าง ${difference} บาท` });
  let lineNotified = false;
  if (extension?.billToken && booking.lineUserId && !booking.lineUserId.startsWith("pending:") && lineConfigured(booking.lineOa)) {
    try { await pushLine(booking.lineUserId, [{ type: "text", text: `มีการแก้ไขรายการจอง ${booking._id} ค่ะ\nยอดส่วนต่าง ${difference.toLocaleString("th-TH")} บาท\nบิลใหม่ต้องชำระภายใน 1 ชั่วโมง: ${requestOrigin(request)}/bill/${extension.billToken}` }], booking.lineOa); lineNotified = true; } catch (error) { console.error("LINE booking modification notice failed:", error); }
  }
  return Response.json({ ok: true, ...details, items, start, end, days, schedule, deliveryFee: shipping, estimatedTotal: newTotal, difference, credit: difference < 0 ? Math.abs(difference) : 0, extension, penalty: penaltyExtension, lineNotified });
}
