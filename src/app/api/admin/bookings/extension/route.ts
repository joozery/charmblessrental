import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { blockingFilter, getQueue } from "@/lib/availability-store";
import { activeExtensions, extendedDays, shiftSchedule, lastUseDay, type Extension } from "@/lib/extension";
import { ledgerDate, thaiDay, transactions, validDay } from "@/lib/finance";
import { lineConfigured, pushLine } from "@/lib/line";
import { database } from "@/lib/mongodb";
import { effectivePricing, priceFor } from "@/lib/pricing";
import type { Product } from "@/lib/products";
import { blockRange, countUseDays, type ScheduleRecord } from "@/lib/schedule";
import { getStoreSettings } from "@/lib/store-settings";

type BookingDoc = { _id: string; name?: string; status: string; start: string; end: string; days: number; schedule?: ScheduleRecord; items: { id: number; name: string; sku: string }[]; returned?: object; shipment?: object; extensions?: Extension[]; lineUserId?: string; billToken?: string; quote?: { accountNumber?: string } };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const actions = { preview: "bookings", create: "bookings", cancel: "bookings", paid: "payments" } as const;

// What extending to `toEnd` means: the added days, the new return and ready days, any queue clash, and a suggested price.
async function plan(db: Db, booking: BookingDoc, toEnd: string) {
  const fromEnd = lastUseDay(booking);
  if (!booking.schedule) return { error: "คำขอนี้สร้างก่อนมีตารางวันจัดส่ง/คืน จึงขยายวันในระบบไม่ได้" };
  if (toEnd <= fromEnd) return { error: `วันใช้งานวันสุดท้ายใหม่ต้องอยู่หลัง ${day(fromEnd)}` };
  const added = countUseDays(fromEnd, toEnd) - 1;
  if (added > 30) return { error: "ขยายได้ครั้งละไม่เกิน 30 วัน" };
  const schedule = shiftSchedule(booking.schedule, added), from = booking.schedule.ready, to = schedule.ready;
  const ids = [...new Set(booking.items.map(item => item.id))];
  const others = await db.collection<BookingDoc>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": { $in: ids }, _id: { $ne: booking._id } }, { projection: { _id: 1, name: 1, start: 1, end: 1, schedule: 1, items: 1 } }).toArray();
  const conflicts: { item: string; date: string; bookings: { id: string; name: string }[] }[] = [];
  for (const id of ids) {
    const full = (await getQueue(db, id, from, to, booking._id)).filter(row => row.remaining < 1);
    const item = booking.items.find(row => row.id === id)!;
    for (const row of full) conflicts.push({ item: item.sku || item.name, date: row.date, bookings: others.filter(other => other.items.some(entry => entry.id === id) && blockRange(other).from <= row.date && row.date < blockRange(other).to).map(other => ({ id: other._id, name: other.name || "" })) });
  }
  // Suggested price: what the longer rental costs minus what the current length costs, per piece.
  const settings = await getStoreSettings();
  const products = await db.collection<Product>("products").find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, customPricing: 1, dailyRate: 1, category: 1 } }).toArray();
  const before = booking.days + extendedDays(booking), after = before + added;
  const parts = booking.items.map(item => { const product = products.find(row => row.id === item.id); const pricing = product ? effectivePricing(product, settings.rentalPricing, settings.extraDayRates) : null; const was = priceFor(pricing, before), now = priceFor(pricing, after); return was === null || now === null ? null : Math.max(0, now - was); });
  const standard = parts.every(part => part !== null) ? parts.reduce<number>((sum, part) => sum + (part || 0), 0) : null;
  // After dispatch, late days include the return day and every Gap day.
  const lateDays = booking.shipment ? Math.max(0, countUseDays(booking.schedule.returnDate, toEnd)) : 0;
  const deliveredDays = booking.shipment ? Math.max(0, added - lateDays) : 0;
  const deliveredAmount = deliveredDays * 50;
  const lateAmount = lateDays * 100;
  const suggested = !booking.shipment ? standard : deliveredAmount + lateAmount;
  const chargeType: Extension["chargeType"] = !booking.shipment ? "standard" : lateDays ? "late" : "delivered";
  return { fromEnd, toEnd, added, schedule, conflicts, suggested, standard, deliveredDays, lateDays, deliveredAmount, lateAmount, chargeType };
}

async function notify(request: Request, db: Db, booking: BookingDoc, text: (link: string) => string, token?: string) {
  if (!booking.lineUserId || !lineConfigured()) return false;
  const billToken = token || booking.billToken || randomBytes(18).toString("base64url");
  if (!token && !booking.billToken) await db.collection<BookingDoc>("bookingRequests").updateOne({ _id: booking._id }, { $set: { billToken } });
  try { await pushLine(booking.lineUserId, [{ type: "text", text: text(`${new URL(request.url).origin}/bill/${billToken}`) }]); return true; } catch (error) { console.error("LINE extension notice failed:", error); return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || body.id.length > 100 || !Object.hasOwn(actions, body.action)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin(actions[body.action as keyof typeof actions]);
  if (auth.error) return auth.error;
  const admin = auth.admin, db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.id });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  const log = (action: string, summary: string, changes: { field: string; before: unknown; after: unknown }[] = []) => audit(request, admin, { action, targetType: "booking", targetId: booking._id, summary, changes });

  if (body.action === "preview" || body.action === "create") {
    if (booking.status !== "confirmed") return Response.json({ error: "ขยายวันได้เฉพาะคำขอที่ยืนยันจองแล้ว" }, { status: 409 });
    if (booking.returned) return Response.json({ error: "รับชุดคืนแล้ว จึงขยายวันไม่ได้" }, { status: 409 });
    if (!validDay(body.toEnd)) return Response.json({ error: "กรุณาเลือกวันใช้งานวันสุดท้ายใหม่" }, { status: 400 });
    const result = await plan(db, booking, body.toEnd);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    if (body.action === "preview") return Response.json(result);
    // A late return can still be extended over the next rental, but only knowingly and with a note.
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (result.conflicts.length && body.allowClash !== true) return Response.json({ error: `คิวซ้อนวันที่ ${result.conflicts.map(row => `${day(row.date)} (${row.item})`).join(", ")} ติ๊กยืนยันคิวซ้อนก่อนบันทึก` }, { status: 409 });
    if (result.conflicts.length && !note) return Response.json({ error: "คิวซ้อนกับลูกค้าคนอื่น กรุณาใส่หมายเหตุ" }, { status: 400 });
    if (activeExtensions(booking.extensions).some(item => item.status === "unpaid")) return Response.json({ error: "มีค่าเช่าต่อที่ยังไม่ชำระ กรุณายืนยันรับเงินหรือยกเลิกรายการเดิมก่อน" }, { status: 409 });
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0 || body.amount > 1000000) return Response.json({ error: "กรุณากรอกค่าเช่าต่อ" }, { status: 400 });
    const amount = Math.round(body.amount * 100) / 100, now = new Date(), billToken = amount > 0 ? randomBytes(18).toString("base64url") : undefined, dueAt = amount > 0 ? new Date(now.getTime() + 60 * 60 * 1000) : undefined;
    const extension: Extension = { id: randomUUID(), fromEnd: result.fromEnd, toEnd: result.toEnd, addedDays: result.added, amount, status: amount > 0 ? "unpaid" : "paid", createdAt: now, createdByName: admin.name, ...(billToken ? { billToken, dueAt } : {}), chargeType: result.chargeType, ...(result.lateDays ? { lateDays: result.lateDays } : {}), ...(note ? { note } : {}), ...(result.conflicts.length ? { clashDates: [...new Set(result.conflicts.map(row => row.date))] } : {}), ...(amount > 0 ? {} : { paidOn: thaiDay(), paidByName: admin.name }) };
    // Guard on the current ready day so two admins extending at once cannot both shift it.
    const updated = await bookings.updateOne({ _id: booking._id, "schedule.ready": booking.schedule!.ready }, { $set: { schedule: result.schedule, updatedAt: now }, $push: { extensions: extension }, $unset: { returnReminderSentAt: "", lateNoticeSentAt: "" } });
    if (!updated.modifiedCount) return Response.json({ error: "คำขอนี้เพิ่งถูกแก้ไข กรุณาโหลดใหม่แล้วลองอีกครั้ง" }, { status: 409 });
    await log("booking.extended", `ขยายวันเช่า +${result.added} วัน ถึง ${result.toEnd} · ค่าเช่าต่อ ${money(amount)} บาท${result.conflicts.length ? ` · คิวซ้อน ${result.conflicts.map(row => `${day(row.date)} ${row.bookings.map(other => other.id).join("/")}`).join(", ")}` : ""}${note ? ` · ${note}` : ""}`, [{ field: "end", before: result.fromEnd, after: result.toEnd }, { field: "returnDate", before: booking.schedule!.returnDate, after: result.schedule.returnDate }]);
    const lineNotified = await notify(request, db, booking, link => `📅 ขยายวันเช่าคำขอ ${booking._id} เรียบร้อยค่ะ\nใช้งานได้ถึง ${day(result.toEnd)} (+${result.added} วัน)\nส่งคืนชุดภายใน ${day(result.schedule.returnDate)}${amount > 0 ? `\n${result.lateDays ? `ค่าปรับล่าช้า ${money(result.lateAmount)} บาท (${result.lateDays} วัน × 100)` : `ค่าเช่าต่อ ${money(amount)} บาท`}\n\nบิลนี้ต้องชำระภายใน 1 ชั่วโมง: ${link}\nแล้วส่งสลิปในแชทนี้นะคะ 🙏` : ""}`, billToken);
    return Response.json({ extension, schedule: result.schedule, lineNotified });
  }

  const extension = (booking.extensions || []).find(item => item.id === body.extensionId);
  if (!extension) return Response.json({ error: "ไม่พบรายการเช่าต่อนี้" }, { status: 404 });
  if (extension.status !== "unpaid") return Response.json({ error: extension.status === "paid" ? "รายการนี้ชำระแล้ว" : "รายการนี้ถูกยกเลิกแล้ว" }, { status: 409 });

  if (body.action === "paid") {
    if (body.paidOn !== undefined && !validDay(body.paidOn)) return Response.json({ error: "วันที่ชำระไม่ถูกต้อง" }, { status: 400 });
    const paidOn = body.paidOn || thaiDay(), now = new Date();
    const updated = await bookings.updateOne({ _id: booking._id, extensions: { $elemMatch: { id: extension.id, status: "unpaid" } } }, { $set: { "extensions.$.status": "paid", "extensions.$.paidOn": paidOn, "extensions.$.paidByName": admin.name, updatedAt: now } });
    if (!updated.modifiedCount) return Response.json({ error: "มีผู้บันทึกรายการนี้ไปแล้ว" }, { status: 409 });
    await transactions(db).insertOne({ _id: randomUUID(), type: "income", category: "ค่าเช่า", amount: extension.amount, date: ledgerDate(paidOn), note: `ค่าเช่าต่อ ${booking._id} (+${extension.addedDays} วัน)`, createdAt: now, createdBy: admin.email || admin.username, createdByName: admin.name, bookingId: booking._id, source: "extension" });
    await log("booking.extension_paid", `ยืนยันรับค่าเช่าต่อ ${money(extension.amount)} บาท`, [{ field: "paidOn", before: null, after: paidOn }]);
    const lineNotified = await notify(request, db, booking, () => `✅ ร้านได้รับค่าเช่าต่อ ${money(extension.amount)} บาท ของคำขอ ${booking._id} แล้วค่ะ\nใช้งานได้ถึง ${day(extension.toEnd)} อย่าลืมส่งคืนชุดตามกำหนดนะคะ 💗`);
    return Response.json({ extension: { ...extension, status: "paid", paidOn, paidByName: admin.name }, lineNotified });
  }

  // cancel: only the latest extension, and only before the money came in; the return day and gap slide back.
  if (activeExtensions(booking.extensions).at(-1)?.id !== extension.id) return Response.json({ error: "ยกเลิกได้เฉพาะการเช่าต่อครั้งล่าสุด" }, { status: 409 });
  if (booking.returned || !booking.schedule) return Response.json({ error: "รับชุดคืนแล้ว จึงยกเลิกการเช่าต่อไม่ได้" }, { status: 409 });
  const schedule = shiftSchedule(booking.schedule, -extension.addedDays), now = new Date();
  const updated = await bookings.updateOne({ _id: booking._id, extensions: { $elemMatch: { id: extension.id, status: "unpaid" } } }, { $set: { schedule, "extensions.$.status": "cancelled", "extensions.$.cancelledAt": now, "extensions.$.cancelledByName": admin.name, updatedAt: now } });
  if (!updated.modifiedCount) return Response.json({ error: "มีผู้แก้ไขรายการนี้ไปแล้ว" }, { status: 409 });
  await log("booking.extension_cancelled", `ยกเลิกการเช่าต่อ +${extension.addedDays} วัน`, [{ field: "end", before: extension.toEnd, after: extension.fromEnd }]);
  return Response.json({ extension: { ...extension, status: "cancelled", cancelledAt: now.toISOString(), cancelledByName: admin.name }, schedule });
}
