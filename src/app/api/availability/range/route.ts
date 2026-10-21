import { database } from "@/lib/mongodb";
import { blockingFilter } from "@/lib/availability-store";
import { addDays, blockRange, planFor, type ScheduleRecord } from "@/lib/schedule";
import { getStoreSettings } from "@/lib/store-settings";
import { validDay } from "@/lib/finance";

// Which products are free for the use dates (both ends counted), allowing for parcel shipping ahead and the return gap.
export async function GET(request: Request) {
  const url = new URL(request.url), start = url.searchParams.get("start"), end = url.searchParams.get("end");
  if (!validDay(start) || !validDay(end) || end < start || (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 >= 90) return Response.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const settings = await getStoreSettings();
  const standard = settings.shippingOptions.find(option => option.enabled && option.standard)?.id || "pickup";
  const plan = planFor(settings, start, end, standard, "parcel");
  const from = plan.ship, to = plan.ready;
  const products = await db.collection<{ id: number; stock?: number }>("products").find({ active: { $ne: false }, stock: { $gt: 0 } }, { projection: { _id: 0, id: 1, stock: 1 } }).toArray();
  const ids = products.map(product => product.id);
  if (!ids.length) return Response.json({ availability: {} }, { headers: { "Cache-Control": "no-store" } });
  const [capacityRows, confirmed] = await Promise.all([
    db.collection<{ productId: number; date: string; capacity: number }>("productAvailability").find({ productId: { $in: ids }, date: { $gte: from, $lt: to } }, { projection: { _id: 0, productId: 1, date: 1, capacity: 1 } }).toArray(),
    db.collection<{ start: string; end: string; items: { id: number }[]; schedule?: ScheduleRecord }>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": { $in: ids } }, { projection: { _id: 0, start: 1, end: 1, items: 1, schedule: 1 } }).toArray(),
  ]);
  const capacities = new Map(capacityRows.map(row => [`${row.productId}:${row.date}`, row.capacity]));
  const reserved = new Map<string, number>();
  for (const booking of confirmed) {
    const range = blockRange(booking);
    for (const item of booking.items) for (let day = range.from > from ? range.from : from; day < (range.to < to ? range.to : to); day = addDays(day, 1)) { const key = `${item.id}:${day}`; reserved.set(key, (reserved.get(key) || 0) + 1); }
  }
  const availability = Object.fromEntries(products.map(product => {
    let full = false;
    for (let day = from; day < to && !full; day = addDays(day, 1)) { const key = `${product.id}:${day}`; if ((capacities.get(key) ?? product.stock ?? 0) - (reserved.get(key) || 0) < 1) full = true; }
    return [product.id, full ? "unavailable" : "available"];
  }));
  return Response.json({ availability }, { headers: { "Cache-Control": "private, no-store" } });
}
