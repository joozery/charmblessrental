import { requireAdmin } from "@/lib/admin-auth";
import { getQueue, queueBookings } from "@/lib/availability-store";
import { database } from "@/lib/mongodb";

// One piece's month for the admin: free count per day and every booking or hold that takes it out of the queue.
export async function GET(request: Request) {
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const productId = Number(params.get("productId")), month = params.get("month") || "";
  if (!Number.isSafeInteger(productId) || productId < 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const from = `${month}-01`, next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const to = next.toISOString().slice(0, 10), db = await database();
  const [days, bookings] = await Promise.all([getQueue(db, productId, from, to), queueBookings(db, productId, from, to)]);
  return Response.json({ days, bookings });
}
