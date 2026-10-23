import { database } from "@/lib/mongodb";
import { getQueue } from "@/lib/availability-store";
import { planFor } from "@/lib/schedule";
import { getStoreSettings } from "@/lib/store-settings";
import { validDay } from "@/lib/finance";

// Which products are free for the use dates (both ends counted), allowing for parcel shipping ahead and the return gap.
export async function GET(request: Request) {
  const url = new URL(request.url), start = url.searchParams.get("start"), end = url.searchParams.get("end");
  if (!validDay(start) || !validDay(end) || end < start || (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 >= 90) return Response.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const settings = await getStoreSettings();
  const standard = settings.shippingOptions.find(option => option.enabled && option.standard)?.id || "pickup";
  const products = await db.collection<{ id: number; stock?: number; gapDays?: number | null }>("products").find({ active: { $ne: false }, stock: { $gt: 0 } }, { projection: { _id: 0, id: 1, stock: 1, gapDays: 1 } }).toArray();
  const ids = products.map(product => product.id);
  if (!ids.length) return Response.json({ availability: {} }, { headers: { "Cache-Control": "no-store" } });
  const availability = Object.fromEntries(await Promise.all(products.map(async product => {
    const productPlan = planFor(settings, start, end, standard, "parcel", product.gapDays ?? settings.schedule.gap.parcel);
    const queue = await getQueue(db, product.id, productPlan.ship, productPlan.ready);
    return [product.id, queue.some(day => day.remaining < 1) ? "unavailable" : "available"] as const;
  })));
  return Response.json({ availability }, { headers: { "Cache-Control": "private, no-store" } });
}
