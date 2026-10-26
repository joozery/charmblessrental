import { randomBytes, randomUUID } from "node:crypto";
import { database } from "@/lib/mongodb";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { ownerOf } from "@/lib/bill-owner";
import { getStoreSettings } from "@/lib/store-settings";
import { isReturnMethod, planFor, scheduleRecord, addDays, type ReturnMethod } from "@/lib/schedule";
import { adminUseQueue } from "@/lib/admin-availability";
import { shippingFor } from "@/lib/shipping";
import { quoteDelivery } from "@/lib/delivery-quote";
import type { Product } from "@/lib/products";
import { identityAllowed, normalizePhone } from "@/lib/identity";
import { cleanCode, discountCoupons, validCoupon } from "@/lib/discounts";

const day = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
type AdminBooking = { _id: string; [key: string]: unknown };
type ItemInput = { id: number; quantity: number; rental: number; deposit?: number; note?: string };
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("bookings"); if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const itemInputs = Array.isArray(body?.items) ? body.items as ItemInput[] : [];
  if (!body || !text(body.name, 120) || !text(body.phone, 40) || itemInputs.length < 1 || itemInputs.length > 20 || itemInputs.some(item => !item || !Number.isSafeInteger(item.id) || item.id < 1 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || typeof item.rental !== "number" || !Number.isFinite(item.rental) || item.rental < 0 || (item.deposit !== undefined && (typeof item.deposit !== "number" || !Number.isFinite(item.deposit) || item.deposit < 0))) || !day(body.start) || !day(body.end) || body.end < body.start || !text(body.method, 40) || (body.method !== "pickup" && !text(body.address, 1000)) || (body.returnMethod !== undefined && !isReturnMethod(body.returnMethod)) || (body.depositMode !== undefined && !["deposit", "identity"].includes(body.depositMode)) || (body.shipping !== undefined && (typeof body.shipping !== "number" || body.shipping < 0))) return Response.json({ error: "กรุณากรอกรายละเอียดรายการใหม่ให้ครบถ้วน" }, { status: 400 });
  const ids = [...new Set(itemInputs.map(item => item.id))]; if (ids.length !== itemInputs.length) return Response.json({ error: "เลือกสินค้าซ้ำกันไม่ได้" }, { status: 400 });
  const db = await database(), settings = await getStoreSettings();
  const discountCode = cleanCode(body.discountCode);
  if (discountCode && !validCoupon(await discountCoupons(db).findOne({ code: discountCode }))) return Response.json({ error: "โค้ดส่วนลดไม่ถูกต้อง หมดอายุ หรือใช้ครบจำนวนแล้ว" }, { status: 400 });
  const products = await db.collection<Product>("products").find({ id: { $in: ids }, active: { $ne: false }, stock: { $gt: 0 } }, { projection: { _id: 0, id: 1, name: 1, thai: 1, sku: 1, dailyRate: 1, customPricing: 1, category: 1, depositRequired: 1, shippingFee: 1, gapDays: 1, images: 1, stock: 1 } }).toArray();
  if (products.length !== ids.length) return Response.json({ error: "มีสินค้าที่ไม่พร้อมให้เช่า" }, { status: 409 });
  const returnMethod: ReturnMethod = body.returnMethod || "parcel", days = Math.round((Date.parse(`${body.end}T00:00:00Z`) - Date.parse(`${body.start}T00:00:00Z`)) / 86400000) + 1;
  const plans = new Map(products.map(product => [product.id, planFor(settings, body.start, body.end, body.method, returnMethod, product.gapDays ?? settings.schedule.gap[returnMethod])]));
  for (const product of products) { const requested = itemInputs.find(item => item.id === product.id)!.quantity; const full = (await adminUseQueue(db, product.id, body.start, addDays(body.end, 1))).find(item => item.remaining < requested); if (full) return Response.json({ error: `${product.thai || product.name} มีสินค้าไม่พอในวันที่ ${full.date} (ต้องการ ${requested} ชิ้น)` }, { status: 409 }); }
  const rental = itemInputs.reduce<number | null>((sum, item) => { const value = item.rental; return sum === null ? null : sum + value * item.quantity; }, 0);
  if (rental === null) return Response.json({ error: "สินค้านี้ไม่มีราคาตามจำนวนวันที่เลือก กรุณาระบุค่าเช่าเอง" }, { status: 400 });
  const messengerQuote = body.method === "messenger" ? await quoteDelivery(db, settings.messenger, { pin: typeof body.pin === "string" ? body.pin.trim() : "", address: body.address.trim() }).catch(() => ({ error: "คำนวณค่าส่งแมสไม่สำเร็จ" })) : null;
  const messengerFee = messengerQuote && "fee" in messengerQuote ? messengerQuote.fee : null;
  const shippingQuote = shippingFor(settings, body.method, products, settings.messenger.inBill ? messengerFee : null);
  const shipping = shippingQuote?.fee;
  if (shippingQuote === null || shipping === null || shipping === undefined) return Response.json({ error: "ไม่สามารถคำนวณค่าจัดส่งตามวิธีหน้าร้านได้ กรุณาตรวจสอบที่อยู่/หมุดหรือการตั้งค่าขนส่ง" }, { status: 400 });
  const deposit = body.depositMode === "identity" ? 0 : itemInputs.reduce((sum, item) => sum + (item.deposit || 0) * item.quantity, 0);
  if (body.depositMode === "identity" && !identityAllowed(settings.verification, rental, products.map(product => product.category), products.some(product => product.depositRequired === true))) return Response.json({ error: "รายการนี้ไม่เข้าเงื่อนไขยืนยันตัวตนแทนมัดจำ กรุณาเลือกวางเงินมัดจำ" }, { status: 400 });
  const quote = { rental, deposit, shipping, bank: settings.rentalDocument.bank, accountName: settings.rentalDocument.accountName, accountNumber: settings.rentalDocument.accountNumber, qrImage: settings.rentalDocument.qrImage, returnAddress: settings.rentalDocument.returnAddress, returnPhone: settings.rentalDocument.returnPhone, returnMethod: settings.rentalDocument.returnMethod, updatedAt: new Date(), updatedBy: auth.admin.email || auth.admin.username };
  const now = new Date(), id = `BR-ADMIN-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`, billToken = randomBytes(18).toString("base64url");
  await db.collection<AdminBooking>("bookingRequests").insertOne({ _id: id, billOwner: ownerOf(auth.admin), status: "new", name: body.name.trim(), phone: body.phone.trim(), address: body.method === "pickup" ? "" : body.address.trim(), pin: typeof body.pin === "string" ? body.pin.trim() : "", note: body.note?.trim() || "สร้างโดยแอดมิน", method: body.method, start: body.start, end: body.end, days, schedule: scheduleRecord(planFor(settings, body.start, body.end, body.method, returnMethod, Math.max(...products.map(product => product.gapDays ?? settings.schedule.gap[returnMethod]))), returnMethod), deliveryFee: shipping, estimatedTotal: rental + quote.deposit + shipping, shipping: { label: shippingQuote.label, base: shippingQuote.base, discount: shippingQuote.discount }, ...(body.depositMode === "identity" ? { verification: { mode: "identity", status: "pending", profileId: normalizePhone(body.phone) } } : {}), ...(messengerQuote && "km" in messengerQuote ? { delivery: { km: messengerQuote.km, fee: messengerQuote.fee, inBill: settings.messenger.inBill, location: messengerQuote.location, address: messengerQuote.address } } : {}), quote, items: products.map(product => { const input = itemInputs.find(item => item.id === product.id)!; return { id: product.id, name: product.thai || product.name, sku: product.sku || "", image: product.images?.[0] || "", dailyRate: product.dailyRate, rentalPrice: input.rental, depositPrice: input.deposit || 0, quantity: input.quantity, note: input.note?.trim() || "", stock: product.stock ?? 1, schedule: scheduleRecord(plans.get(product.id)!, returnMethod) }; }), createdAt: now, updatedAt: now, updatedBy: auth.admin.email || auth.admin.username, billToken, payment: "unpaid" });
  if (discountCode) await db.collection<AdminBooking>("bookingRequests").updateOne({ _id: id }, { $set: { discountCode } });
  await audit(request, auth.admin, { action: "booking.created", targetType: "booking", targetId: id, summary: `สร้างรายการจองใหม่โดยแอดมิน · ${body.name.trim()}`, changes: [{ field: "source", before: null, after: "admin" }] });
  return Response.json({ ok: true, id, billToken });
}
