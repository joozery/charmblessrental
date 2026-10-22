import { requireAdmin } from "@/lib/admin-auth";
import { blockingFilter, getQueue } from "@/lib/availability-store";
import { lastUseDay, type Extension } from "@/lib/extension";
import { database } from "@/lib/mongodb";
import { addDays, blockRange, type ScheduleRecord } from "@/lib/schedule";

type BookingDoc = { _id: string; name?: string; status: string; start: string; end: string; schedule?: ScheduleRecord; items: { id: number }[]; extensions?: Extension[]; verification?: { status: string } };

// One piece's month for the admin: free count per day and every booking or hold that takes it out of the queue.
export async function GET(request: Request) {
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const productId = Number(params.get("productId")), month = params.get("month") || "";
  if (!Number.isSafeInteger(productId) || productId < 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const from = `${month}-01`, next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const to = next.toISOString().slice(0, 10);
  const db = await database();
  const [days, rows] = await Promise.all([
    getQueue(db, productId, from, to),
    db.collection<BookingDoc>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": productId }, { projection: { _id: 1, name: 1, status: 1, start: 1, end: 1, schedule: 1, extensions: 1, "verification.status": 1 } }).sort({ start: 1 }).toArray(),
  ]);
  const bookings = rows.map(row => {
    const range = blockRange(row), end = lastUseDay(row);
    return { id: row._id, name: row.name || "", confirmed: row.status === "confirmed", ship: range.from, start: row.start, end, returnDate: row.schedule?.returnDate ?? addDays(end, 1), ready: range.to };
  });
  return Response.json({ days, bookings });
}
