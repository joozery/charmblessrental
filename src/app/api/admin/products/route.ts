import { categoryLabels } from "@/lib/products";
import { isProductImage } from "@/lib/product-images";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { createProduct, getProducts, updateProduct, type ProductFields } from "@/lib/product-store";
import { revalidateTag } from "next/cache";
import { cleanPricing, validPricing } from "@/lib/pricing";
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
  if (!text("name") || !Object.hasOwn(categoryLabels, text("category")) || !validAmount(body.dailyRate) || !validAmount(body.deposit) || typeof body.active !== "boolean" || ["name", "color", "size", "description"].some(key => text(key).length > 3000) || !images.length || images.length > 12 || !images.every(isProductImage) || (body.id !== undefined && (!Number.isSafeInteger(body.id) || body.id < 1))) return Response.json({ error: "กรุณาตรวจสอบชื่อ ประเภท รูป และราคาอีกครั้ง" }, { status: 400 });
  if (body.customPricing !== null && !validPricing(body.customPricing)) return Response.json({ error: "ตรวจสอบตารางราคาเฉพาะสินค้าอีกครั้ง" }, { status: 400 });
  if (body.id === undefined && (!Number.isSafeInteger(body.pieces) || body.pieces < 1 || body.pieces > 50 || !validAmount(body.cost))) return Response.json({ error: "กรุณาระบุจำนวนชิ้นเริ่มต้น 1–50 ชิ้น และต้นทุนต่อชิ้น" }, { status: 400 });
  const fields: ProductFields = {
    name: text("name"), thai: text("name"), category: text("category"), tag: categoryLabels[text("category")],
    color: text("color"), size: text("size"), dailyRate: body.dailyRate, deposit: body.deposit,
    description: text("description"), notes: text("description"), images: [...new Set<string>(images)], active: body.active,
    customPricing: body.customPricing?.tiers.length ? cleanPricing(body.customPricing) : null,
  };
  try {
    if (body.id === undefined) {
      const created = await createProduct(fields, Array.from({ length: body.pieces }, () => ({ cost: body.cost, note: "" })));
      await audit(request, auth.admin, { action: "product.create", targetType: "product", targetId: String(created.id), summary: `เพิ่มสินค้า ${created.code} ${fields.name} (${created.units.length} ชิ้น)`, changes: diff(null, { ...fields, stock: created.units.length }, ["name", "category", "dailyRate", "deposit", "stock"]) });
    } else {
      const before = await updateProduct(body.id, fields);
      const changes = diff(before, fields, ["name", "category", "color", "size", "dailyRate", "customPricing", "deposit", "active", "description", "images"]);
      if (changes.length) await audit(request, auth.admin, { action: changes.some(change => ["dailyRate", "customPricing", "deposit"].includes(change.field)) ? "product.price" : "product.update", targetType: "product", targetId: String(body.id), summary: `แก้ไขสินค้า ${before.sku || ""} ${fields.name}`.trim(), changes });
    }
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ products: await getProducts() });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") return Response.json({ error: "ไม่พบสินค้า กรุณาโหลดหน้าใหม่" }, { status: 404 });
    return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
