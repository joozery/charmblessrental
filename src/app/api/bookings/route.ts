import { randomBytes, randomUUID } from "node:crypto";
import { database } from "@/lib/mongodb";
import { sameOrigin } from "@/lib/admin-auth";
import type { Product } from "@/lib/products";
import { getStoreSettings } from "@/lib/store-settings";
import { effectivePricing, priceFor } from "@/lib/pricing";
import { quoteDelivery } from "@/lib/delivery-quote";
import type { LatLng } from "@/lib/delivery";
import { shippingFor } from "@/lib/shipping";
import { addDays, isReturnMethod, planFor, scheduleRecord, type ReturnMethod, type ScheduleRecord } from "@/lib/schedule";

const validDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const thaiDay = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
type BookingRecord = { _id: string; status: string; name: string; phone: string; address: string; pin: string; note: string; method: string; start: string; end: string; days: number; deliveryFee: number; estimatedTotal: number | null; delivery?: { km: number; fee: number; inBill: boolean; location: LatLng; address: string } | { error: string }; shipping?: { label: string; base: number | null; discount: number }; schedule: ScheduleRecord; items: { id: number; name: string; sku: string; image: string; dailyRate: number | null; rentalPrice: number | null; stock: number }[]; createdAt: Date; updatedAt: Date; billToken: string; payment: "unpaid" | "paid" };
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  try {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20 || body.items.some((item: { id?: unknown }) => typeof item?.id !== "number" || !Number.isSafeInteger(item.id) || item.id < 1) || !validDay(body.start) || !validDay(body.end) || body.start < thaiDay() || body.end < body.start || (Date.parse(`${body.end}T00:00:00Z`) - Date.parse(`${body.start}T00:00:00Z`)) / 86400000 >= 90 || !(body.returnMethod === undefined || isReturnMethod(body.returnMethod)) || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120 || typeof body.phone !== "string" || !(/^(?:0[689]\d{8}|\+[1-9]\d{7,14})$/.test(body.phone.replace(/[\s()-]/g, ""))) || typeof body.method !== "string" || body.method.length > 30 || (body.method !== "pickup" && (typeof body.address !== "string" || !body.address.trim() || body.address.length > 1000)) || (body.pin !== undefined && (typeof body.pin !== "string" || body.pin.length > 1000)) || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2000)) || body.acceptPrivacy !== true) return Response.json({ error: "กรุณาตรวจสอบข้อมูลการจองและยอมรับการใช้ข้อมูลติดต่อ" }, { status: 400 });
  const ids = [...new Set((body.items as { id: number }[]).map(item => item.id))];
  if (ids.length !== body.items.length) return Response.json({ error: "มีสินค้าเดิมซ้ำในรายการ กรุณาตรวจสอบตะกร้า" }, { status: 400 });
  const db = await database();
  const products = await db.collection<Product>("products").find({ id: { $in: ids }, active: { $ne: false }, stock: { $gt: 0 } }, { projection: { _id: 0, id: 1, name: 1, thai: 1, sku: 1, dailyRate: 1, customPricing: 1, category: 1, shippingFee: 1, images: 1, image: 1, stock: 1 } }).toArray();
  if (products.length !== ids.length) return Response.json({ error: "มีสินค้าที่ไม่พร้อมให้เช่าแล้ว กรุณาโหลดหน้าร้านใหม่" }, { status: 409 });
  const settings = await getStoreSettings();
  // start and end are the first and last days of use (both counted); the plan adds shipping ahead, the return day and the gap.
  const returnMethod: ReturnMethod = body.returnMethod ?? "parcel";
  const plan = planFor(settings, body.start, body.end, body.method, returnMethod);
  const days = plan.days;
  if (plan.ship < thaiDay()) return Response.json({ error: `วิธีรับชุดนี้ร้านต้องส่งล่วงหน้า ${plan.lead} วัน กรุณาเลือกวันเริ่มใช้งานตั้งแต่ ${new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${addDays(thaiDay(), plan.lead)}T00:00:00Z`))} หรือเลือกวิธีรับชุดอื่น` }, { status: 400 });
  // Messenger fees are recomputed here from the shop's own settings; the browser's figure is only a preview.
  const quote = body.method === "messenger" ? await quoteDelivery(db, settings.messenger, { pin: body.pin?.trim(), address: body.address?.trim() }).catch(error => { console.error("Delivery quote failed:", error); return { error: "คำนวณค่าส่งไม่สำเร็จ" }; }) : null;
  const delivery = quote && "km" in quote ? { km: quote.km, fee: quote.fee, inBill: settings.messenger.inBill, location: quote.location, address: quote.address } : quote ? { error: quote.error } : undefined;
  // Carrier fee, bulky-item minimum and the "rent 2, ship free" promotion, worked out the same way as the booking form shows it.
  const shipping = shippingFor(settings, body.method, products, delivery && "fee" in delivery && delivery.inBill ? delivery.fee : null);
  if (!shipping) return Response.json({ error: "วิธีจัดส่งนี้ปิดให้บริการแล้ว กรุณาเลือกวิธีอื่น" }, { status: 400 });
  const deliveryFee = shipping.fee ?? 0;
  const prices = new Map(products.map(product => [product.id, priceFor(effectivePricing(product, settings.rentalPricing, settings.extraDayRates), days)]));
  const estimatedTotal = [...prices.values()].every(price => price !== null) ? [...prices.values()].reduce<number>((sum, price) => sum + (price || 0), 0) + deliveryFee : null;
  const requestId = `BR-${body.start.replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  await db.collection<BookingRecord>("bookingRequests").insertOne({
    _id: requestId, status: "new", name: body.name.trim(), phone: body.phone.trim(), address: body.method === "pickup" ? "" : body.address.trim(), pin: body.pin?.trim() || "", note: body.note?.trim() || "",
    method: body.method, start: body.start, end: body.end, days, schedule: scheduleRecord(plan, returnMethod), deliveryFee, estimatedTotal, shipping: { label: shipping.label, base: shipping.base, discount: shipping.discount }, ...(delivery ? { delivery } : {}),
    items: products.map(product => ({ id: product.id, name: product.thai || product.name, sku: product.sku || "", image: product.images?.[0] || "", dailyRate: product.dailyRate, rentalPrice: prices.get(product.id) ?? null, stock: product.stock ?? 1 })),
    createdAt: new Date(), updatedAt: new Date(), billToken: randomBytes(18).toString("base64url"), payment: "unpaid",
  });
  return Response.json({ requestId, estimatedTotal }, { status: 201 });
  } catch (error) {
    console.error("Booking request failed:", error);
    return Response.json({ error: "ระบบรับคำขอจองขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งหรือติดต่อร้านทาง LINE" }, { status: 503 });
  }
}
