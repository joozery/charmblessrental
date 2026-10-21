import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { needsTracking } from "@/lib/rental-stage";

type BookingDoc = { _id: string; name?: string; status: string; billToken: string; shipment?: object; returned?: object; customerReturn?: { carrier: string; trackingNumber: string; at: Date } };
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max;

// The bill link is the customer's key: whoever holds it can report how the items are coming back.
export async function POST(request: Request, ctx: RouteContext<"/api/bill/[token]/return">) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const { token } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!/^[\w-]{20,40}$/.test(token) || !body || !text(body.carrier, 60) || !body.carrier.trim() || !text(body.trackingNumber, 60)) return Response.json({ error: "กรุณากรอกขนส่งให้ถูกต้อง" }, { status: 400 });
  const carrier = body.carrier.trim(), trackingNumber = body.trackingNumber.trim().toUpperCase();
  if (needsTracking(carrier) && !trackingNumber) return Response.json({ error: "กรุณากรอกเลขพัสดุ" }, { status: 400 });
  const bookings = (await database()).collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ billToken: token }, { projection: { _id: 1, name: 1, status: 1, shipment: 1, returned: 1, customerReturn: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบรายการเช่านี้" }, { status: 404 });
  if (booking.status === "cancelled" || !booking.shipment) return Response.json({ error: "รายการนี้ยังไม่ได้จัดส่ง จึงยังแจ้งส่งคืนไม่ได้" }, { status: 409 });
  if (booking.returned) return Response.json({ error: "ร้านได้รับสินค้าคืนแล้ว" }, { status: 409 });
  const customerReturn = { carrier, trackingNumber, at: new Date() };
  await bookings.updateOne({ _id: booking._id }, { $set: { customerReturn, updatedAt: new Date() } });
  await audit(request, null, { action: "booking.customer_return", targetType: "booking", targetId: booking._id, summary: `ลูกค้าแจ้งส่งคืน · ${carrier} ${trackingNumber}`.trim(), actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`, changes: [{ field: "carrier", before: booking.customerReturn?.carrier ?? null, after: carrier }, { field: "trackingNumber", before: booking.customerReturn?.trackingNumber ?? null, after: trackingNumber }] });
  return Response.json({ ok: true, customerReturn: { ...customerReturn, at: customerReturn.at.toISOString() } });
}
