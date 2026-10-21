import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { cleanPricing, validPricing } from "@/lib/pricing";
import { getStoreSettings, type StoreSettings } from "@/lib/store-settings";

const label = (pricing: StoreSettings["rentalPricing"]) => pricing.tiers.map(tier => `${tier.days} วัน ${tier.price}`).join(", ") + (pricing.extraPerDay == null ? "" : ` · เกินวันละ ${pricing.extraPerDay}`) || "ไม่ได้ตั้ง";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  if (!validPricing(body)) return Response.json({ error: "ตรวจสอบจำนวนวันและราคาอีกครั้ง" }, { status: 400 });
  const pricing = cleanPricing(body);
  const before = (await getStoreSettings()).rentalPricing;
  await (await database()).collection<StoreSettings & { _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { rentalPricing: pricing } }, { upsert: true });
  revalidateTag("catalog", { expire: 0 });
  if (label(before) !== label(pricing)) await audit(request, auth.admin, { action: "settings.rental_pricing", targetType: "settings", targetId: "rentalPricing", summary: "แก้ไขตารางราคาเช่ามาตรฐาน", changes: [{ field: "rentalPricing", before: label(before), after: label(pricing) }] });
  return Response.json({ pricing });
}
