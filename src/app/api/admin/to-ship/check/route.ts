import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";

type CheckBody = { bookingId: string; itemIndex: number; checked: boolean };
type BookingRecord = { _id: string };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null) as Partial<CheckBody> | null;
  const itemIndex = body?.itemIndex;
  if (!body || typeof body.bookingId !== "string" || body.bookingId.length > 100 || typeof itemIndex !== "number" || !Number.isInteger(itemIndex) || itemIndex < 0 || typeof body.checked !== "boolean") {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;

  const db = await database();
  const result = await db.collection<BookingRecord>("bookingRequests").updateOne(
    { _id: body.bookingId, [`items.${itemIndex}`]: { $exists: true } },
    { $set: { [`items.${itemIndex}.checkedForShipment`]: body.checked } },
  );
  if (!result.matchedCount) return Response.json({ error: "ไม่พบรายการสินค้านี้" }, { status: 404 });
  return Response.json({ ok: true, checked: body.checked });
}
