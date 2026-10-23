import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { adjustedRental, type Adjustment } from "@/lib/adjustment";
import { audit } from "@/lib/audit";
import { getQueue } from "@/lib/availability-store";
import { activeExtensions, type Extension } from "@/lib/extension";
import { ledgerDate, thaiDay, transactions, validDay } from "@/lib/finance";
import type { BookingVerification } from "@/lib/identity";
import { lineConfigured, pushLine } from "@/lib/line";
import { database } from "@/lib/mongodb";
import { depositFor, effectivePricing, priceFor } from "@/lib/pricing";
import type { Product } from "@/lib/products";
import { assignUnits } from "@/lib/rental-units";
import { blockRange, countUseDays, planFor, scheduleRecord, type ReturnMethod, type ScheduleRecord } from "@/lib/schedule";
import { getStoreSettings } from "@/lib/store-settings";
import { requestOrigin } from "@/lib/request-origin";

type Item = { id: number; name: string; sku: string; image: string; dailyRate: number | null; rentalPrice?: number | null; stock?: number; unitSku?: string };
type BookingDoc = { _id: string; name?: string; status: string; method: string; start: string; end: string; days: number; deliveryFee: number; estimatedTotal: number | null; schedule?: ScheduleRecord; items: Item[]; payment?: "unpaid" | "paid"; quote?: { rental?: number; deposit?: number; shipping?: number }; shipment?: object; returned?: object; extensions?: Extension[]; adjustments?: Adjustment[]; verification?: BookingVerification; lineUserId?: string; billToken?: string };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const actions = { search: "bookings", preview: "bookings", apply: "pricing", settle: "payments" } as const;

// The booking as it would be with new dates and pieces: schedule, queue clashes, and the rent by the shop's own table.
async function plan(db: Db, booking: BookingDoc, start: string, end: string, ids: number[]) {
  if (!validDay(start) || !validDay(end) || end < start || countUseDays(start, end) > 90) return { error: "ช่วงวันที่ไม่ถูกต้อง" };
  if (!ids.length || ids.length > 20 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) return { error: "ต้องมีสินค้าอย่างน้อย 1 รายการ" };
  const settings = await getStoreSettings();
  const products = await db.collection<Product>("products").find({ id: { $in: [...new Set(ids)] } }, { projection: { _id: 0, id: 1, name: 1, thai: 1, sku: 1, images: 1, image: 1, dailyRate: 1, customPricing: 1, category: 1, stock: 1, deposit: 1 } }).toArray();
  if (products.length !== new Set(ids).size) return { error: "มีสินค้าที่ไม่พบในระบบ" };
  const days = countUseDays(start, end);
  const returnMethod: ReturnMethod = booking.schedule?.returnMethod ?? "parcel";
  const rentalPlan = planFor(settings, start, end, booking.method, returnMethod);
  const schedule = scheduleRecord(rentalPlan, returnMethod);
  const lines = ids.map(id => { const product = products.find(row => row.id === id)!; return { id, name: product.thai || product.name, sku: product.sku || "", image: product.images?.[0] || product.image || "", dailyRate: product.dailyRate ?? null, rentalPrice: priceFor(effectivePricing(product, settings.rentalPricing, settings.extraDayRates), days), stock: product.stock ?? 1, deposit: depositFor(product, settings.categoryDeposits) }; });
  // Each product needs as many free pieces as it appears in the booking, over the whole span it is away.
  const range = blockRange({ start, end, schedule }), conflicts: { item: string; date: string }[] = [];
  for (const id of new Set(ids)) {
    const want = ids.filter(other => other === id).length, line = lines.find(row => row.id === id)!;
    for (const row of await getQueue(db, id, range.from, range.to, booking._id)) if (row.remaining < want) conflicts.push({ item: line.sku || line.name, date: row.date });
  }
  const rental = lines.every(line => line.rentalPrice !== null) ? lines.reduce((sum, line) => sum + (line.rentalPrice || 0), 0) : null;
  const deposit = booking.verification?.mode === "identity" ? 0 : lines.reduce((sum, line) => sum + line.deposit, 0);
  // What the customer is billed for rent now: the saved quote (plus earlier differences), else the booking's own estimate.
  const current = booking.quote?.rental !== undefined ? adjustedRental(booking.quote.rental, booking.adjustments) : (booking.estimatedTotal ?? 0) - (booking.deliveryFee || 0);
  return { days, schedule, lines, conflicts, rental, deposit, current, tooSoon: rentalPlan.ship < thaiDay() };
}

async function notify(request: Request, db: Db, booking: BookingDoc, text: (link: string) => string) {
  if (!booking.lineUserId || !lineConfigured()) return false;
  const billToken = booking.billToken || randomBytes(18).toString("base64url");
  if (!booking.billToken) await db.collection<BookingDoc>("bookingRequests").updateOne({ _id: booking._id }, { $set: { billToken } });
  try { await pushLine(booking.lineUserId, [{ type: "text", text: text(`${requestOrigin(request)}/bill/${billToken}`) }]); return true; } catch (error) { console.error("LINE booking edit notice failed:", error); return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !Object.hasOwn(actions, body.action)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin(actions[body.action as keyof typeof actions]);
  if (auth.error) return auth.error;
  const admin = auth.admin, db = await database();

  if (body.action === "search") {
    const q = typeof body.q === "string" ? body.q.trim().slice(0, 60) : "";
    if (!q) return Response.json({ products: [] });
    const pattern = new RegExp(escape(q), "i");
    const products = await db.collection<Product>("products").find({ active: { $ne: false }, $or: [{ sku: pattern }, { name: pattern }, { thai: pattern }] }, { projection: { _id: 0, id: 1, name: 1, thai: 1, sku: 1, images: 1, image: 1 } }).limit(20).toArray();
    return Response.json({ products: products.map(product => ({ id: product.id, name: product.thai || product.name, sku: product.sku || "", image: product.images?.[0] || product.image || "" })) });
  }

  if (typeof body.id !== "string" || body.id.length > 100) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.id });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  const log = (action: string, summary: string, changes: { field: string; before: unknown; after: unknown }[] = []) => audit(request, admin, { action, targetType: "booking", targetId: booking._id, summary, changes });

  if (body.action === "settle") {
    const adjustment = (booking.adjustments || []).find(item => item.id === body.adjustmentId);
    if (!adjustment || !["unpaid", "refund"].includes(adjustment.status)) return Response.json({ error: "ไม่พบรายการส่วนต่างที่รอดำเนินการ" }, { status: 404 });
    if (body.settledOn !== undefined && !validDay(body.settledOn)) return Response.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    const settledOn = body.settledOn || thaiDay(), status = adjustment.status === "unpaid" ? "paid" : "refunded", now = new Date();
    const updated = await bookings.updateOne({ _id: booking._id, adjustments: { $elemMatch: { id: adjustment.id, status: adjustment.status } } }, { $set: { "adjustments.$.status": status, "adjustments.$.settledOn": settledOn, "adjustments.$.settledByName": admin.name, updatedAt: now } });
    if (!updated.modifiedCount) return Response.json({ error: "มีผู้บันทึกรายการนี้ไปแล้ว" }, { status: 409 });
    // Money in is rent income; money handed back is an expense against rent.
    await transactions(db).insertOne({ _id: randomUUID(), type: status === "paid" ? "income" : "expense", category: status === "paid" ? "ค่าเช่า" : "คืนเงินค่าเช่า", amount: Math.abs(adjustment.amount), date: ledgerDate(settledOn), note: `ส่วนต่างจากการแก้ไขการจอง ${booking._id}`, createdAt: now, createdBy: admin.email || admin.username, createdByName: admin.name, bookingId: booking._id, source: "adjustment" });
    await log(status === "paid" ? "booking.adjustment_paid" : "booking.adjustment_refunded", `${status === "paid" ? "ยืนยันรับเงินส่วนต่าง" : "ยืนยันคืนเงินส่วนต่าง"} ${money(Math.abs(adjustment.amount))} บาท`, [{ field: "settledOn", before: null, after: settledOn }]);
    if (status === "refunded") await notify(request, db, booking, link => `ร้านคืนเงินส่วนต่าง ${money(Math.abs(adjustment.amount))} บาท ของคำขอ ${booking._id} แล้วค่ะ\nดูรายละเอียด: ${link}`);
    return Response.json({ adjustment: { ...adjustment, status, settledOn, settledByName: admin.name } });
  }

  // Editing: only before the pieces leave the shop, and with nothing extended on top (extend after shipping instead).
  if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (booking.shipment || booking.returned) return Response.json({ error: "ส่งชุดออกไปแล้ว แก้ไขการจองไม่ได้ ใช้ \"ขยายวันเช่า\" แทน" }, { status: 409 });
  if (activeExtensions(booking.extensions).length) return Response.json({ error: "คำขอนี้มีการเช่าต่ออยู่ ยกเลิกการเช่าต่อก่อนจึงแก้ไขได้" }, { status: 409 });
  const ids: number[] = Array.isArray(body.itemIds) ? body.itemIds : [];
  const result = await plan(db, booking, body.start, body.end, ids);
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  if (body.action === "preview") return Response.json(result);

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (result.conflicts.length && body.allowClash !== true) return Response.json({ error: "คิวซ้อนกับลูกค้าคนอื่น ติ๊กยืนยันก่อนบันทึก" }, { status: 409 });
  if (result.conflicts.length && !note) return Response.json({ error: "คิวซ้อนกับลูกค้าคนอื่น กรุณาใส่หมายเหตุ" }, { status: 400 });
  if (typeof body.rental !== "number" || !Number.isFinite(body.rental) || body.rental < 0 || body.rental > 1000000) return Response.json({ error: "กรุณากรอกค่าเช่าใหม่" }, { status: 400 });
  const rental = Math.round(body.rental * 100) / 100, now = new Date(), paid = booking.payment === "paid";
  const difference = Math.round((rental - result.current) * 100) / 100;
  // Pieces stay with an item whose product and dates did not change; otherwise the shop picks again.
  const sameDates = booking.start === body.start && booking.end === body.end;
  const kept = [...booking.items];
  const items = result.lines.map(line => { const at = sameDates ? kept.findIndex(old => old.id === line.id) : -1; const unitSku = at >= 0 ? kept.splice(at, 1)[0].unitSku : undefined; return { id: line.id, name: line.name, sku: line.sku, image: line.image, dailyRate: line.dailyRate, rentalPrice: line.rentalPrice, stock: line.stock, ...(unitSku ? { unitSku } : {}) }; });
  const assigned = booking.status === "confirmed" ? await assignUnits(db, { _id: booking._id, start: body.start, end: body.end, items, schedule: result.schedule }) : items;
  const summary = `แก้ไขการจอง: ${day(body.start)}–${day(body.end)} (${result.days} วัน) · ${result.lines.map(line => line.sku || line.name).join(", ")}`;
  const adjustment: Adjustment | null = paid && difference !== 0 ? { id: randomUUID(), summary, amount: difference, status: difference > 0 ? "unpaid" : "refund", createdAt: now, createdByName: admin.name, ...(note ? { note } : {}) } : null;
  const set: Record<string, unknown> = { start: body.start, end: body.end, days: result.days, schedule: result.schedule, items: assigned, estimatedTotal: rental + (booking.deliveryFee || 0), updatedAt: now };
  // Before payment the quote itself follows the edit (new rent, deposit of the new pieces); after payment it stays as paid.
  if (!paid && booking.quote) Object.assign(set, { "quote.rental": rental, "quote.deposit": result.deposit });
  await bookings.updateOne({ _id: booking._id }, { $set: set, ...(adjustment ? { $push: { adjustments: adjustment } } : {}) });
  await log("booking.edited", `${summary} · ค่าเช่า ${money(result.current)} → ${money(rental)} บาท${adjustment ? ` · ${difference > 0 ? "ลูกค้าต้องจ่ายเพิ่ม" : "ร้านต้องคืน"} ${money(Math.abs(difference))} บาท` : ""}${result.conflicts.length ? " · คิวซ้อน" : ""}${note ? ` · ${note}` : ""}`, [
    { field: "start", before: booking.start, after: body.start }, { field: "end", before: booking.end, after: body.end },
    { field: "items", before: booking.items.map(item => item.sku || item.name).join(", "), after: result.lines.map(line => line.sku || line.name).join(", ") },
    { field: "rental", before: result.current, after: rental },
  ].filter(change => change.before !== change.after));
  const lineNotified = await notify(request, db, booking, link => `📝 ร้านแก้ไขการจอง ${booking._id} ให้แล้วค่ะ\nใช้งาน ${day(body.start)} – ${day(body.end)} (${result.days} วัน)\nชุด: ${result.lines.map(line => line.sku || line.name).join(", ")}${adjustment ? `\n${difference > 0 ? `ค่าเช่าส่วนต่างที่ต้องชำระเพิ่ม ${money(difference)} บาท โอนได้ตามบัญชีในลิงก์บิล` : `ร้านจะคืนเงินส่วนต่าง ${money(-difference)} บาท`}` : ""}\nดูรายละเอียด: ${link}`);
  return Response.json({ booking: { start: body.start, end: body.end, days: result.days, schedule: result.schedule, items: assigned, estimatedTotal: rental + (booking.deliveryFee || 0), ...(!paid && booking.quote ? { quote: { ...booking.quote, rental, deposit: result.deposit } } : {}) }, adjustment, lineNotified });
}
