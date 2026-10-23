import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import type { AdminAccount } from "@/lib/admin-accounts";
import { audit } from "@/lib/audit";
import { ownerOf, type BillOwner } from "@/lib/bill-owner";
import { database } from "@/lib/mongodb";

// The shop owner moves a bill to the admin who really handled it, or clears it.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.bookingId !== "string" || body.bookingId.length > 100 || typeof body.adminId !== "string" || body.adminId.length > 100) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin("owner");
  if (auth.error) return auth.error;
  const db = await database();
  const bookings = db.collection<{ _id: string; billOwner?: BillOwner }>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.bookingId }, { projection: { billOwner: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบบิลนี้" }, { status: 404 });
  const target = body.adminId ? await db.collection<AdminAccount>("admins").findOne({ _id: body.adminId }, { projection: { _id: 1, name: 1, email: 1, username: 1 } }) : null;
  if (body.adminId && !target) return Response.json({ error: "ไม่พบแอดมินคนนี้" }, { status: 404 });
  const owner = target ? ownerOf(target, auth.admin.name) : null;
  await bookings.updateOne({ _id: booking._id }, owner ? { $set: { billOwner: owner } } : { $unset: { billOwner: "" } });
  await audit(request, auth.admin, { action: "booking.bill_owner", targetType: "booking", targetId: booking._id, summary: `เปลี่ยนผู้ทำบิล: ${booking.billOwner?.name || "ไม่ระบุ"} → ${owner?.name || "ไม่ระบุ"}`, changes: [{ field: "billOwner", before: booking.billOwner?.name ?? null, after: owner?.name ?? null }] });
  return Response.json({ ok: true, owner: owner ? { adminId: owner.adminId, name: owner.name } : null });
}
