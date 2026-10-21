import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { messengerFee, parseLatLng, validLatLng, type MessengerSettings } from "@/lib/delivery";
import { mapsConfigured, quoteDelivery, resolvePin } from "@/lib/delivery-quote";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";

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
