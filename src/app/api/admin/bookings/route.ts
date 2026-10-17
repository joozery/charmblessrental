import { currentAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { getEffectiveAvailability } from "@/lib/availability-store";
const statuses = ["new", "contacted", "confirmed", "cancelled"];
type BookingDoc = { _id: string; status: string; updatedAt?: Date; updatedBy?: string; start: string; end: string; items: { id: number; name?: string }[] };
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || body.id.length > 100 || !statuses.includes(body.status)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.id });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  if (body.status === "confirmed" && booking.status !== "confirmed") {
    const days = (Date.parse(`${booking.end}T00:00:00Z`) - Date.parse(`${booking.start}T00:00:00Z`)) / 86400000;
    for (const item of booking.items) {
      const available = await getEffectiveAvailability(db, item.id, booking.start, booking.end);
      if (available.length < days || available.some(day => day.remaining < 1)) return Response.json({ error: `คิวของ ${item.name || "สินค้าบางรายการ"} ไม่พอหรือยังไม่ได้ตั้งจำนวนว่างครบทุกวัน` }, { status: 409 });
    }
  }
  await bookings.updateOne({ _id: body.id }, { $set: { status: body.status, updatedAt: new Date(), updatedBy: admin.email } });
  return Response.json({ ok: true });
}
