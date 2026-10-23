import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { cleanPricing, validExtraRates, validPricing, type ExtraDayRates } from "@/lib/pricing";
import { getStoreSettings, type StoreSettings } from "@/lib/store-settings";
import { validLateRates, type LateRates } from "@/lib/extension";

const label = (pricing: StoreSettings["rentalPricing"]) => pricing.tiers.map(tier => `${tier.days} วัน ${tier.price}`).join(", ") + (pricing.extraPerDay == null ? "" : ` · เกินวันละ ${pricing.extraPerDay}`) || "ไม่ได้ตั้ง";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  // Extra-day charges: shop-wide per day plus per-category overrides (cameras 100).
  if (body && typeof body === "object" && (body as { action?: string }).action === "extra") {
    const value = (body as { rates?: unknown }).rates;
    if (!validExtraRates(value)) return Response.json({ error: "ตรวจสอบค่าเช่าส่วนเกินอีกครั้ง" }, { status: 400 });
    const rates: ExtraDayRates = { perDay: value.perDay === null ? null : Math.round(value.perDay), byCategory: Object.fromEntries(Object.entries(value.byCategory).map(([category, perDay]) => [category.trim(), Math.round(perDay)])) };
    const before = (await getStoreSettings()).extraDayRates;
    const show = (item: ExtraDayRates) => [`ทั่วไปวันละ ${item.perDay ?? "—"}`, ...Object.entries(item.byCategory).map(([category, perDay]) => `${category} วันละ ${perDay}`)].join(" · ");
    await (await database()).collection<{ _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { extraDayRates: rates } }, { upsert: true });
    revalidateTag("catalog", { expire: 0 });
    if (show(before) !== show(rates)) await audit(request, auth.admin, { action: "settings.rental_pricing", targetType: "settings", targetId: "extraDayRates", summary: `แก้ไขค่าเช่าส่วนเกิน · ${show(rates)}`, changes: [{ field: "extraDayRates", before: show(before), after: show(rates) }] });
    return Response.json({ rates });
  }
  // Once the piece is with the customer: extending per day, and the fine per day for returning late.
  if (body && typeof body === "object" && (body as { action?: string }).action === "late") {
    const value = (body as { rates?: unknown }).rates;
    if (!validLateRates(value)) return Response.json({ error: "ตรวจสอบอัตราอีกครั้ง" }, { status: 400 });
    const rates: LateRates = { afterShipPerDay: Math.round(value.afterShipPerDay), lateFinePerDay: Math.round(value.lateFinePerDay) };
    const before = (await getStoreSettings()).lateRates, show = (item: LateRates) => `เช่าต่อหลังส่งวันละ ${item.afterShipPerDay} · ค่าปรับคืนช้าวันละ ${item.lateFinePerDay}`;
    await (await database()).collection<{ _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { lateRates: rates } }, { upsert: true });
    revalidateTag("catalog", { expire: 0 });
    if (show(before) !== show(rates)) await audit(request, auth.admin, { action: "settings.rental_pricing", targetType: "settings", targetId: "lateRates", summary: `แก้ไขอัตราเช่าต่อ/ค่าปรับ · ${show(rates)}`, changes: [{ field: "lateRates", before: show(before), after: show(rates) }] });
    return Response.json({ rates });
  }
  if (!validPricing(body)) return Response.json({ error: "ตรวจสอบจำนวนวันและราคาอีกครั้ง" }, { status: 400 });
  const pricing = cleanPricing(body);
  const before = (await getStoreSettings()).rentalPricing;
  await (await database()).collection<StoreSettings & { _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { rentalPricing: pricing } }, { upsert: true });
  revalidateTag("catalog", { expire: 0 });
  if (label(before) !== label(pricing)) await audit(request, auth.admin, { action: "settings.rental_pricing", targetType: "settings", targetId: "rentalPricing", summary: "แก้ไขตารางราคาเช่ามาตรฐาน", changes: [{ field: "rentalPricing", before: label(before), after: label(pricing) }] });
  return Response.json({ pricing });
}
