import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { getEffectiveAvailability, getReservationCounts } from "@/lib/availability-store";

const validMonth = (value: string | null) => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const invalidDay = (value: unknown, month: unknown) => {
  if (!value || typeof value !== "object") return true;
  const day = value as { date?: unknown; remaining?: unknown };
  if (!validDate(day.date) || typeof month !== "string") return true;
  return day.date.slice(0, 7) !== month || !(day.remaining === null || typeof day.remaining === "number" && Number.isSafeInteger(day.remaining) && day.remaining >= 0 && day.remaining <= 1000);
};
type Day = { productId: number; date: string; capacity: number; updatedAt: Date; updatedBy?: string };

export async function GET(request: Request) {
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const url = new URL(request.url), month = url.searchParams.get("month"), productId = Number(url.searchParams.get("productId"));
  if (!validMonth(month) || !Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const from = `${month}-01`, end = new Date(`${from}T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  const db = await database();
  const [days, product] = await Promise.all([getEffectiveAvailability(db, productId, from, end.toISOString().slice(0, 10)), db.collection<{ id: number; stock?: number }>("products").findOne({ id: productId }, { projection: { _id: 0, stock: 1 } })]);
  // Days left blank use the pieces in stock as their capacity.
  return Response.json({ days, defaultCapacity: product?.stock ?? 0 });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const admin = auth.admin;
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.productId) || body.productId < 1 || !validMonth(body.month) || !Array.isArray(body.days) || body.days.length > 31 || body.days.some((day: unknown) => invalidDay(day, body.month))) return Response.json({ error: "ข้อมูลคิวไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const product = await db.collection<{ name?: string; sku?: string }>("products").findOne({ id: body.productId }, { projection: { _id: 1, name: 1, sku: 1 } });
  if (!product) return Response.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const collection = db.collection<Day>("productAvailability");
  await collection.createIndex({ productId: 1, date: 1 }, { unique: true });
  const from = `${body.month}-01`, end = new Date(`${from}T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  const reservations = await getReservationCounts(db, body.productId, from, end.toISOString().slice(0, 10));
  const operations = body.days.map((day: { date: string; remaining: number | null }) => {
    const reserved = reservations.get(day.date) || 0;
    return day.remaining === null && reserved === 0
      ? { deleteOne: { filter: { productId: body.productId, date: day.date } } }
      : { updateOne: { filter: { productId: body.productId, date: day.date }, update: { $set: { productId: body.productId, date: day.date, capacity: (day.remaining || 0) + reserved, updatedAt: new Date(), updatedBy: admin.email } }, upsert: true } };
  });
  if (operations.length) await collection.bulkWrite(operations);
  if (operations.length) await audit(request, admin, { action: "availability.update", targetType: "product", targetId: String(body.productId), summary: `ปรับคิวว่าง ${product.sku || product.name || body.productId} เดือน ${body.month} (${operations.length} วัน)`, changes: body.days.slice(0, 31).map((day: { date: string; remaining: number | null }) => ({ field: day.date, before: null, after: day.remaining })) });
  return Response.json({ ok: true });
}
