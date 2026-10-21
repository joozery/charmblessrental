import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { canMove } from "@/lib/preparation";
import { setUnitStatuses } from "@/lib/product-store";
import { unitStatusLabels, unitsOf, type Product, type UnitStatus } from "@/lib/products";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
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
