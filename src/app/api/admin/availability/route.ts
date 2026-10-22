import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { can } from "@/lib/permissions";
import { getQueue, queueBookings } from "@/lib/availability-store";

const validMonth = (value: string | null) => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
// capacity: the pieces the shop rents out that day, bookings included (0 closes the day); null goes back to the stock count.
const invalidDay = (value: unknown, month: unknown) => {
  if (!value || typeof value !== "object") return true;
  const day = value as { date?: unknown; capacity?: unknown };
  if (!validDate(day.date) || typeof month !== "string") return true;
  return day.date.slice(0, 7) !== month || !(day.capacity === null || typeof day.capacity === "number" && Number.isSafeInteger(day.capacity) && day.capacity >= 0 && day.capacity <= 1000);
};
type Day = { productId: number; date: string; capacity: number; updatedAt: Date; updatedBy?: string };
const monthRange = (month: string) => { const from = `${month}-01`, end = new Date(`${from}T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); return { from, to: end.toISOString().slice(0, 10) }; };

// The month for one piece: the shop's own settings, what is still free each day, and (for booking staff) who holds it.
export async function GET(request: Request) {
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const url = new URL(request.url), month = url.searchParams.get("month"), productId = Number(url.searchParams.get("productId"));
  if (!validMonth(month) || !Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { from, to } = monthRange(month!);
  const db = await database();
  const [overrides, days, bookings, product] = await Promise.all([
    db.collection<Day>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    getQueue(db, productId, from, to),
    can(auth.admin, "bookings") ? queueBookings(db, productId, from, to) : Promise.resolve(null),
    db.collection<{ id: number; stock?: number }>("products").findOne({ id: productId }, { projection: { _id: 0, stock: 1 } }),
  ]);
  return Response.json({ stock: product?.stock ?? 0, overrides, days, bookings });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const admin = auth.admin;
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.productId) || body.productId < 1 || !validMonth(body.month) || !Array.isArray(body.days) || body.days.length < 1 || body.days.length > 31 || body.days.some((day: unknown) => invalidDay(day, body.month))) return Response.json({ error: "ข้อมูลคิวไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const product = await db.collection<{ name?: string; sku?: string }>("products").findOne({ id: body.productId }, { projection: { _id: 1, name: 1, sku: 1 } });
  if (!product) return Response.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const collection = db.collection<Day>("productAvailability");
  await collection.createIndex({ productId: 1, date: 1 }, { unique: true });
  const days = body.days as { date: string; capacity: number | null }[];
  const before = new Map((await collection.find({ productId: body.productId, date: { $in: days.map(day => day.date) } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray()).map(day => [day.date, day.capacity]));
  await collection.bulkWrite(days.map(day => day.capacity === null
    ? { deleteOne: { filter: { productId: body.productId, date: day.date } } }
    : { updateOne: { filter: { productId: body.productId, date: day.date }, update: { $set: { productId: body.productId, date: day.date, capacity: day.capacity, updatedAt: new Date(), updatedBy: admin.email } }, upsert: true } }));
  const label = (value: number | null | undefined) => value == null ? "ตามสต๊อก" : value === 0 ? "ปิดรับ" : `${value} ชิ้น`;
  await audit(request, admin, { action: "availability.update", targetType: "product", targetId: String(body.productId), summary: `ปรับคิวว่าง ${product.sku || product.name || body.productId} (${days.length} วัน)`, changes: days.map(day => ({ field: day.date, before: label(before.get(day.date)), after: label(day.capacity) })) });
  return Response.json({ ok: true });
}
