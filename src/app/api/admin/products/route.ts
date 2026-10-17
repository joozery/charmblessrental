import { categoryLabels } from "@/lib/products";
import { isProductImage } from "@/lib/product-images";
import { isAdmin, sameOrigin } from "@/lib/admin-auth";
import { saveProduct } from "@/lib/product-store";
import { database } from "@/lib/mongodb";
import type { Product } from "@/lib/products";
export async function POST(request: Request) {
  if (!sameOrigin(request) || !await isAdmin()) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const text = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
  if (!text("name") || !Object.hasOwn(categoryLabels, text("category")) || (body.cost !== null && !(typeof body.cost === "number" && Number.isFinite(body.cost) && body.cost >= 0)) || !isProductImage(text("imageUrl")) || Object.values(body).some(value => typeof value === "string" && value.length > 3000) || (body.id !== undefined && (!Number.isSafeInteger(body.id) || body.id < 1))) return Response.json({ error: "กรุณากรอกชื่อ ประเภท และรูปสินค้าให้ครบ ต้นทุนต้องไม่ติดลบ" }, { status: 400 });
  try {
    const existing = body.id === undefined ? null : await (await database()).collection<Product>("products").findOne({ id: body.id });
    if (body.id !== undefined && !existing) return Response.json({ error: "ไม่พบสินค้า กรุณาโหลดหน้าใหม่" }, { status: 404 });
    // Only inventory-sheet fields are editable here. Existing storefront settings are preserved.
    const items = await saveProduct({
      name: text("name"), thai: text("name"), category: text("category"), tag: categoryLabels[text("category")],
      sku: text("sku"), cost: body.cost, notes: text("description"), description: text("description"), images: [text("imageUrl")],
      inventoryStatus: existing?.inventoryStatus ?? "อยู่ที่ร้าน",
      color: existing?.color ?? "", size: existing?.size ?? "", dailyRate: existing?.dailyRate ?? null,
      deposit: existing?.deposit ?? null, stock: existing?.stock ?? 1, active: existing?.active ?? false,
    }, body.id);
    return Response.json({ products: items });
  } catch { return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
}
