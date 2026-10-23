import { database } from "@/lib/mongodb";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { isReturnMethod } from "@/lib/schedule";
import { addDays } from "@/lib/schedule";
import { adminUseQueue } from "@/lib/admin-availability";

const day = (value: string | null) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
export async function GET(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("bookings"); if (auth.error) return auth.error;
  const url = new URL(request.url), start = url.searchParams.get("start"), end = url.searchParams.get("end"), returnMethod = url.searchParams.get("returnMethod") || "parcel";
  const ids = (url.searchParams.get("ids") || "").split(",").map(Number).filter(Number.isSafeInteger);
  if (!day(start) || !day(end) || end! < start! || !ids.length || !isReturnMethod(returnMethod)) return Response.json({ error: "ช่วงวันหรือรายการสินค้าไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const products = await db.collection<{ id: number; stock?: number; gapDays?: number | null }>("products").find({ id: { $in: ids }, active: { $ne: false }, stock: { $gt: 0 } }, { projection: { _id: 0, id: 1, stock: 1, gapDays: 1 } }).toArray();
  const availability = Object.fromEntries(await Promise.all(products.map(async product => {
    const queue = await adminUseQueue(db, product.id, start!, addDays(end!, 1));
    return [product.id, Math.min(product.stock ?? 0, ...queue.map(item => item.remaining))] as const;
  })));
  return Response.json({ availability }, { headers: { "Cache-Control": "private, no-store" } });
}
