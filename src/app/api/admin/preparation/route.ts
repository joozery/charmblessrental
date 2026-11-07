import { revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { canMove } from "@/lib/preparation";
import { setUnitStatuses } from "@/lib/product-store";
import { unitStatusLabels, unitsOf, type Product, type UnitStatus } from "@/lib/products";
import type { BookingPenalty } from "@/lib/penalty";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (body?.action === "penalty") {
    if (typeof body.bookingId !== "string" || body.bookingId.length > 100 || typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1000000 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return Response.json({ error: "กรุณากรอกค่าปรับและเหตุผลให้ครบถ้วน" }, { status: 400 });
    const db = await database(), bookings = db.collection<{ _id: string; returned?: unknown; status: string }>("bookingRequests");
    const booking = await bookings.findOne({ _id: body.bookingId }, { projection: { _id: 1, returned: 1, status: 1 } });
    if (!booking || booking.status === "cancelled") return Response.json({ error: "ไม่พบรายการจองนี้" }, { status: 404 });
    if (!booking.returned) return Response.json({ error: "บันทึกค่าปรับได้หลังรับคืนสินค้าแล้ว" }, { status: 409 });
    const penalty: BookingPenalty = { id: randomUUID(), amount: Math.round(body.amount * 100) / 100, reason: body.reason.trim(), createdAt: new Date(), createdByName: auth.admin.name };
    await bookings.updateOne({ _id: booking._id }, { $push: { penalties: penalty }, $set: { updatedAt: new Date() } });
    await audit(request, auth.admin, { action: "booking.penalty_recorded", targetType: "booking", targetId: booking._id, summary: `บันทึกค่าปรับ ${penalty.amount} บาท · ${penalty.reason}`, changes: [{ field: "penalty", before: null, after: penalty }] });
    return Response.json({ penalty });
  }
  if (!body || typeof body.sku !== "string" || body.sku.length > 100 || !Object.hasOwn(unitStatusLabels, body.to) || typeof body.note !== "string" || body.note.length > 500) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const product = await db.collection<Product>("products").findOne({ "units.sku": body.sku });
  const unit = product && unitsOf(product).find(item => item.sku === body.sku);
  if (!product || !unit) return Response.json({ error: "ไม่พบชิ้นสินค้านี้ กรุณาโหลดหน้าใหม่" }, { status: 404 });
  const to = body.to as UnitStatus;
  if (!canMove(unit.status, to)) return Response.json({ error: `ชิ้นนี้อยู่สถานะ “${unitStatusLabels[unit.status]}” แล้ว กรุณาโหลดหน้าใหม่` }, { status: 409 });
  const note = body.note.trim();
  await setUnitStatuses(db, [{ sku: body.sku, status: to, ...(note ? { note } : to === "available" ? { note: "" } : {}) }]);
  await audit(request, auth.admin, { action: "product.unit", targetType: "product", targetId: String(product.id), summary: `${body.sku} ${unitStatusLabels[unit.status]} → ${unitStatusLabels[to]}${note ? ` · ${note}` : ""}`, changes: [{ field: "status", before: unit.status, after: to }, ...(note ? [{ field: "note", before: unit.note, after: note }] : [])] });
  revalidateTag("catalog", { expire: 0 });
  return Response.json({ ok: true, status: to });
}
