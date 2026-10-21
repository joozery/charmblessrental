import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { messengerFee, parseLatLng, validLatLng, type MessengerSettings } from "@/lib/delivery";
import { mapsConfigured, quoteDelivery, resolvePin } from "@/lib/delivery-quote";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import { validShipping, type FreeShipping, type ShippingOption } from "@/lib/shipping";
import { validSchedule, type ScheduleSettings } from "@/lib/schedule";

const amount = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("settings");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const db = await database();
  // "test" prices a sample address with the saved settings, so the shop can check before customers see it.
  if (body?.action === "test") {
    if (typeof body.address !== "string" || !body.address.trim() || body.address.length > 1000) return Response.json({ error: "กรอกที่อยู่หรือลิงก์หมุดที่ต้องการทดสอบ" }, { status: 400 });
    const text = body.address.trim(), pin = /^https?:\/\//.test(text) || parseLatLng(text) ? text : "";
    const quote = await quoteDelivery(db, (await getStoreSettings()).messenger, pin ? { pin } : { address: text });
    return "error" in quote ? Response.json(quote, { status: 422 }) : Response.json(quote);
  }
  if (body?.action === "resolve") {
    if (typeof body.link !== "string" || body.link.length > 1000) return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
    const point = await resolvePin(body.link);
    return point ? Response.json({ point }) : Response.json({ error: "อ่านพิกัดจากลิงก์นี้ไม่ได้ ลองเปิดหมุดใน Google Maps แล้วคัดลอกลิงก์ใหม่ หรือพิมพ์พิกัด เช่น 13.7563, 100.5018" }, { status: 422 });
  }
  if (body?.action === "shipping") {
    if (!validShipping(body.options, body.free) || !validSchedule(body.schedule)) return Response.json({ error: "ตรวจสอบชื่อขนส่ง ราคา และเงื่อนไขส่งฟรีอีกครั้ง" }, { status: 400 });
    const shippingOptions: ShippingOption[] = (body.options as ShippingOption[]).map(option => ({ id: option.id, label: option.label.trim(), fee: Math.round(option.fee), description: option.description.trim(), enabled: option.enabled, standard: option.standard, leadDays: option.leadDays }));
    const schedule: ScheduleSettings = { pickupLead: body.schedule.pickupLead, messengerLead: body.schedule.messengerLead, gap: { parcel: body.schedule.gap.parcel, messenger: body.schedule.gap.messenger, shop: body.schedule.gap.shop } };
    const freeShipping: FreeShipping = { enabled: body.free.enabled, minItems: body.free.minItems };
    const before = await getStoreSettings();
    // {{emsFee}} in the storefront shipping text keeps showing the EMS price set here.
    const ems = shippingOptions.find(option => option.id === "ems");
    await db.collection<{ _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { shippingOptions, freeShipping, schedule, ...(ems ? { emsFee: ems.fee } : {}) } }, { upsert: true });
    revalidateTag("catalog", { expire: 0 });
    const show = (options: ShippingOption[], free: FreeShipping, plan: ScheduleSettings) => `${options.filter(option => option.enabled).map(option => `${option.label} ${option.fee} (ส่งล่วงหน้า ${option.leadDays} วัน)`).join(" · ")}${free.enabled ? ` · เช่าครบ ${free.minItems} ตัวส่งฟรี` : ""} · Gap พัสดุ ${plan.gap.parcel} / แมส ${plan.gap.messenger} / ร้าน ${plan.gap.shop} วัน`;
    if (show(before.shippingOptions, before.freeShipping, before.schedule) !== show(shippingOptions, freeShipping, schedule)) await audit(request, auth.admin, { action: "settings.delivery", targetType: "settings", targetId: "shipping", summary: `ตั้งค่าขนส่ง · ${show(shippingOptions, freeShipping, schedule)}`, changes: [{ field: "shippingOptions", before: show(before.shippingOptions, before.freeShipping, before.schedule), after: show(shippingOptions, freeShipping, schedule) }] });
    return Response.json({ ok: true, shippingOptions, freeShipping });
  }
  const value = body?.settings as MessengerSettings | undefined;
  if (!value || typeof value.enabled !== "boolean" || typeof value.inBill !== "boolean" || !(value.origin === null || validLatLng(value.origin)) || typeof value.originLabel !== "string" || value.originLabel.length > 300 || !amount(value.baseFee, 100000) || !amount(value.includedKm, 500) || !amount(value.perKm, 10000) || !(value.maxKm === null || (amount(value.maxKm, 1000) && value.maxKm > 0)) || typeof value.description !== "string" || value.description.length > 500) return Response.json({ error: "ตรวจสอบตัวเลขและข้อความอีกครั้ง" }, { status: 400 });
  if (value.enabled && !value.origin) return Response.json({ error: "กรุณาระบุตำแหน่งร้านก่อนเปิดคำนวณค่าส่งอัตโนมัติ" }, { status: 400 });
  const messenger: MessengerSettings = { enabled: value.enabled, inBill: value.inBill, origin: value.origin && { lat: Number(value.origin.lat.toFixed(6)), lng: Number(value.origin.lng.toFixed(6)) }, originLabel: value.originLabel.trim(), baseFee: Math.round(value.baseFee), includedKm: value.includedKm, perKm: Math.round(value.perKm), maxKm: value.maxKm, description: value.description.trim() };
  const before = (await getStoreSettings()).messenger;
  await db.collection<{ _id: string; messenger: MessengerSettings }>("storeSettings").updateOne({ _id: "main" }, { $set: { messenger } }, { upsert: true });
  revalidateTag("catalog", { expire: 0 });
  const changes = diff(before, messenger);
  if (changes.length) await audit(request, auth.admin, { action: "settings.delivery", targetType: "settings", targetId: "delivery", summary: `ตั้งค่าส่งแมส · เริ่มต้น ${messenger.baseFee} บาท (${messenger.includedKm} กม.แรก) · กม.ละ ${messenger.perKm} บาท · ตัวอย่าง 10 กม. = ${messengerFee(messenger, 10)} บาท`, changes });
  return Response.json({ ok: true, messenger, mapsReady: mapsConfigured() });
}
