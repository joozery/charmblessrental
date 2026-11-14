import { revalidateTag } from "next/cache";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { addUnits, deleteUnit, getProducts, updateUnit } from "@/lib/product-store";
import { database } from "@/lib/mongodb";
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
      const variantId = typeof body.variantId === "string" && /^[a-z0-9-]{1,40}$/.test(body.variantId) ? body.variantId : undefined;
      const { before, added } = await addUnits(body.productId, body.count, body.cost, body.note.trim(), variantId);
      await audit(request, auth.admin, { action: "product.restock", targetType: "product", targetId: String(body.productId), summary: `เติมสต๊อก ${before.name} +${added.length} ชิ้น (${added.map(unit => unit.sku).join(", ")})`, changes: [{ field: "stock", before: before.stock ?? null, after: (before.stock ?? 0) + added.length }] });
    } else if (body.action === "update") {
      if (typeof body.sku !== "string" || body.sku.length > 100 || !Object.hasOwn(unitStatusLabels, body.status)) return Response.json({ error: "ข้อมูลชิ้นไม่ถูกต้อง" }, { status: 400 });
      const { before, after } = await updateUnit(body.productId, body.sku, { cost: body.cost, status: body.status as UnitStatus, note: body.note.trim() });
      const changes = diff(before, after, ["cost", "status", "note"]);
      if (changes.length) await audit(request, auth.admin, { action: changes.some(change => change.field === "cost") ? "product.price" : "product.unit", targetType: "product", targetId: String(body.productId), summary: `แก้ไขชิ้น ${body.sku}`, changes });
    } else if (body.action === "delete") {
      if (typeof body.sku !== "string" || body.sku.length > 100) return Response.json({ error: "ข้อมูลชิ้นไม่ถูกต้อง" }, { status: 400 });
      const db = await database();
      const bookingCount = await db.collection("bookingRequests").countDocuments({ status: { $ne: "cancelled" }, "items.unitSku": body.sku });
      if (bookingCount) return Response.json({ error: `ลบไม่ได้ เพราะชิ้นนี้ผูกกับรายการจองที่ยังไม่ยกเลิก ${bookingCount} รายการ` }, { status: 409 });
      await deleteUnit(body.productId, body.sku);
      await audit(request, auth.admin, { action: "product.unit", targetType: "product", targetId: String(body.productId), summary: `ลบชิ้น ${body.sku}`, changes: [{ field: "unit", before: body.sku, after: null }] });
    } else return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ products: await getProducts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PRODUCT_NOT_FOUND" || message === "UNIT_NOT_FOUND") return Response.json({ error: "ไม่พบสินค้าหรือชิ้นนี้ กรุณาโหลดหน้าใหม่" }, { status: 404 });
    if (message === "PRODUCT_CHANGED") return Response.json({ error: "มีการแก้ไขสินค้านี้พร้อมกัน กรุณาลองอีกครั้ง" }, { status: 409 });
    if (message === "UNIT_ACTIVE") return Response.json({ error: "กรุณาเปลี่ยนสถานะชิ้นนี้เป็นเลิกใช้แล้วหรือไม่พร้อมเช่าก่อนลบ" }, { status: 409 });
    if (message === "UNIT_REQUIRED") return Response.json({ error: "สินค้านี้ต้องมีชิ้นอย่างน้อย 1 ชิ้น ไม่สามารถลบชิ้นสุดท้ายได้" }, { status: 409 });
    return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
