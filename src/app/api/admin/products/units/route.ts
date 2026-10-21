import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { addUnits, getProducts, updateUnit } from "@/lib/product-store";
import { unitStatusLabels, type UnitStatus } from "@/lib/products";

const validAmount = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10000000;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.productId) || body.productId < 1 || !validAmount(body.cost) || typeof body.note !== "string" || body.note.length > 500) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  try {
    if (body.action === "add") {
      if (!Number.isSafeInteger(body.count) || body.count < 1 || body.count > 50) return Response.json({ error: "เติมสต๊อกได้ครั้งละ 1–50 ชิ้น" }, { status: 400 });
      const { before, added } = await addUnits(body.productId, body.count, body.cost, body.note.trim());
      await audit(request, auth.admin, { action: "product.restock", targetType: "product", targetId: String(body.productId), summary: `เติมสต๊อก ${before.name} +${added.length} ชิ้น (${added.map(unit => unit.sku).join(", ")})`, changes: [{ field: "stock", before: before.stock ?? null, after: (before.stock ?? 0) + added.length }] });
    } else if (body.action === "update") {
      if (typeof body.sku !== "string" || body.sku.length > 100 || !Object.hasOwn(unitStatusLabels, body.status)) return Response.json({ error: "ข้อมูลชิ้นไม่ถูกต้อง" }, { status: 400 });
      const { before, after } = await updateUnit(body.productId, body.sku, { cost: body.cost, status: body.status as UnitStatus, note: body.note.trim() });
      const changes = diff(before, after, ["cost", "status", "note"]);
      if (changes.length) await audit(request, auth.admin, { action: changes.some(change => change.field === "cost") ? "product.price" : "product.unit", targetType: "product", targetId: String(body.productId), summary: `แก้ไขชิ้น ${body.sku}`, changes });
    } else return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ products: await getProducts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PRODUCT_NOT_FOUND" || message === "UNIT_NOT_FOUND") return Response.json({ error: "ไม่พบสินค้าหรือชิ้นนี้ กรุณาโหลดหน้าใหม่" }, { status: 404 });
    if (message === "PRODUCT_CHANGED") return Response.json({ error: "มีการแก้ไขสินค้านี้พร้อมกัน กรุณาลองอีกครั้ง" }, { status: 409 });
    return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
