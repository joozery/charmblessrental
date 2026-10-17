import { database } from "@/lib/mongodb";

const validDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export async function GET(request: Request) {
  const url = new URL(request.url), start = url.searchParams.get("start"), end = url.searchParams.get("end");
  const count = start && end ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 : 0;
  if (!validDay(start) || !validDay(end) || end <= start || count > 90) return Response.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const products = await db.collection<{ id: number }>("products").find({ active: { $ne: false }, stock: { $gt: 0 } }, { projection: { _id: 0, id: 1 } }).toArray();
  const ids = products.map(product => product.id);
  if (!ids.length) return Response.json({ availability: {} }, { headers: { "Cache-Control": "no-store" } });
  const [capacityRows, confirmed] = await Promise.all([
    db.collection<{ productId: number; date: string; capacity: number }>("productAvailability").find({ productId: { $in: ids }, date: { $gte: start, $lt: end } }, { projection: { _id: 0, productId: 1, date: 1, capacity: 1 } }).toArray(),
    db.collection<{ start: string; end: string; items: { id: number }[] }>("bookingRequests").find({ status: "confirmed", start: { $lt: end }, end: { $gt: start }, "items.id": { $in: ids } }, { projection: { _id: 0, start: 1, end: 1, items: 1 } }).toArray(),
  ]);
  const capacities = new Map(capacityRows.map(row => [`${row.productId}:${row.date}`, row.capacity]));
  const reserved = new Map<string, number>();
  for (const booking of confirmed) for (const item of booking.items) if (ids.includes(item.id)) {
    const from = booking.start > start ? booking.start : start, to = booking.end < end ? booking.end : end;
    for (let day = from; day < to; day = nextDay(day)) { const key = `${item.id}:${day}`; reserved.set(key, (reserved.get(key) || 0) + 1); }
  }
  const availability = Object.fromEntries(ids.map(id => {
    let covered = 0, full = false;
    for (let day = start; day < end; day = nextDay(day)) {
      const key = `${id}:${day}`, capacity = capacities.get(key);
      if (capacity === undefined) continue;
      covered++;
      if (capacity - (reserved.get(key) || 0) < 1) full = true;
    }
    return [id, full ? "unavailable" : covered === count ? "available" : "unknown"];
  }));
  return Response.json({ availability }, { headers: { "Cache-Control": "private, no-store" } });
}
function nextDay(value: string) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
