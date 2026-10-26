import { categoryLabels, unitsOf, type Product } from "@/lib/products";
import { isProductImage } from "@/lib/product-images";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { createProduct, getProducts, updateProduct, type ProductFields } from "@/lib/product-store";
import { database } from "@/lib/mongodb";
import { revalidateTag } from "next/cache";
import { cleanPricing, validPricing } from "@/lib/pricing";

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.id) || body.id < 1) return Response.json({ error: "ไม่พบสินค้าที่ต้องการลบ" }, { status: 400 });
  const db = await database();
  const products = db.collection<Product>("products");
  const product = await products.findOne({ id: body.id }, { projection: { _id: 0, id: 1, name: 1, sku: 1, active: 1, units: 1, stock: 1 } });
  if (!product) return Response.json({ error: "ไม่พบสินค้า กรุณาโหลดหน้าใหม่" }, { status: 404 });
  if (product.active !== false) return Response.json({ error: "ต้องซ่อนสินค้าจากหน้าร้านก่อนจึงจะลบได้" }, { status: 409 });
  if (unitsOf(product).some(unit => unit.status !== "retired" && unit.status !== "unavailable")) return Response.json({ error: "กรุณาเปลี่ยนชิ้นสินค้าทั้งหมดเป็นเลิกใช้แล้วหรือไม่พร้อมเช่าก่อนลบ" }, { status: 409 });
  if (await db.collection<{ _id: string }>("bookingRequests").findOne({ status: { $ne: "cancelled" }, "items.id": product.id }, { projection: { _id: 1 } })) return Response.json({ error: "ลบไม่ได้ เพราะสินค้านี้มีคำขอจองที่ยังไม่ยกเลิก" }, { status: 409 });
  const deleted = await products.updateOne({ id: product.id, active: false, deletedAt: { $exists: false } }, { $set: { deletedAt: new Date(), active: false } });
  if (!deleted.modifiedCount) return Response.json({ error: "สินค้าเปลี่ยนแปลงระหว่างลบ กรุณาลองใหม่" }, { status: 409 });
  await audit(request, auth.admin, { action: "product.delete", targetType: "product", targetId: String(product.id), summary: `ลบสินค้า ${product.sku || product.id} ${product.name || ""}`.trim() });
  revalidateTag("catalog", { expire: 0 });
  return Response.json({ products: await getProducts() });
}

// Product codes and piece codes are generated here; the client never sends a sku.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const text = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
  const validAmount = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0;
  const images = Array.isArray(body.images) ? body.images.filter((image: unknown) => typeof image === "string" && image) : [];
  if (!text("name") || !Object.hasOwn(categoryLabels, text("category")) || !validAmount(body.dailyRate) || !validAmount(body.deposit) || typeof body.depositRequired !== "boolean" || typeof body.active !== "boolean" || ["name", "color", "size", "description"].some(key => text(key).length > 3000) || !images.length || images.length > 12 || !images.every(isProductImage) || (body.id !== undefined && (!Number.isSafeInteger(body.id) || body.id < 1))) return Response.json({ error: "กรุณาตรวจสอบชื่อ ประเภท รูป และราคาอีกครั้ง" }, { status: 400 });
  if (!(body.shippingFee === null || body.shippingFee === undefined || (Number.isSafeInteger(body.shippingFee) && body.shippingFee >= 0 && body.shippingFee <= 10000))) return Response.json({ error: "ค่าส่งเฉพาะสินค้าต้องเป็นจำนวนเต็มบาท" }, { status: 400 });
  if (!(body.gapDays === null || body.gapDays === undefined || (Number.isSafeInteger(body.gapDays) && body.gapDays >= 0 && body.gapDays <= 14))) return Response.json({ error: "Gap ของสินค้าต้องเป็นจำนวนเต็ม 0–14 วัน" }, { status: 400 });
  if (body.customPricing !== null && !validPricing(body.customPricing)) return Response.json({ error: "ตรวจสอบตารางราคาเฉพาะสินค้าอีกครั้ง" }, { status: 400 });
  if (body.id === undefined && (!Number.isSafeInteger(body.pieces) || body.pieces < 1 || body.pieces > 50 || !validAmount(body.cost))) return Response.json({ error: "กรุณาระบุจำนวนชิ้นเริ่มต้น 1–50 ชิ้น และต้นทุนต่อชิ้น" }, { status: 400 });
  const fields: ProductFields = {
    name: text("name"), thai: text("name"), category: text("category"), tag: categoryLabels[text("category")],
    color: text("color"), size: text("size"), dailyRate: body.dailyRate, deposit: body.deposit, depositRequired: body.depositRequired,
    description: text("description"), notes: text("description"), images: [...new Set<string>(images)], active: body.active,
    customPricing: body.customPricing?.tiers.length ? cleanPricing(body.customPricing) : null, shippingFee: body.shippingFee ?? null, gapDays: body.gapDays ?? null,
  };
  try {
    if (body.id === undefined) {
      const created = await createProduct(fields, Array.from({ length: body.pieces }, () => ({ cost: body.cost, note: "" })));
      await audit(request, auth.admin, { action: "product.create", targetType: "product", targetId: String(created.id), summary: `เพิ่มสินค้า ${created.code} ${fields.name} (${created.units.length} ชิ้น)`, changes: diff(null, { ...fields, stock: created.units.length }, ["name", "category", "dailyRate", "deposit", "depositRequired", "stock"]) });
    } else {
      const before = await updateProduct(body.id, fields);
      const changes = diff(before, fields, ["name", "category", "color", "size", "dailyRate", "customPricing", "deposit", "depositRequired", "shippingFee", "gapDays", "active", "description", "images"]);
      if (changes.length) await audit(request, auth.admin, { action: changes.some(change => ["dailyRate", "customPricing", "deposit"].includes(change.field)) ? "product.price" : "product.update", targetType: "product", targetId: String(body.id), summary: `แก้ไขสินค้า ${before.sku || ""} ${fields.name}`.trim(), changes });
    }
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ products: await getProducts() });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") return Response.json({ error: "ไม่พบสินค้า กรุณาโหลดหน้าใหม่" }, { status: 404 });
    return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
