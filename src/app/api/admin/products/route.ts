import { categoryLabels } from "@/lib/products";
import { isProductImage } from "@/lib/product-images";
import { isAdmin, sameOrigin } from "@/lib/admin-auth";
import { saveProduct } from "@/lib/product-store";
import { database } from "@/lib/mongodb";
import { revalidateTag } from "next/cache";
import type { Product } from "@/lib/products";
export async function POST(request: Request) {
  if (!sameOrigin(request) || !await isAdmin()) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const text = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
  const validAmount = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (!text("name") || !Object.hasOwn(categoryLabels, text("category")) || !validAmount(body.cost) || !validAmount(body.dailyRate) || !validAmount(body.deposit) || !Number.isSafeInteger(body.stock) || body.stock < 0 || typeof body.active !== "boolean" || ["sku", "name", "color", "size", "description", "imageUrl"].some(key => text(key).length > 3000) || !isProductImage(text("imageUrl")) || (body.id !== undefined && (!Number.isSafeInteger(body.id) || body.id < 1))) return Response.json({ error: "กรุณาตรวจสอบชื่อ ประเภท รูป ราคา และจำนวนสินค้าอีกครั้ง" }, { status: 400 });
  try {
    const existing = body.id === undefined ? null : await (await database()).collection<Product>("products").findOne({ id: body.id });
    if (body.id !== undefined && !existing) return Response.json({ error: "ไม่พบสินค้า กรุณาโหลดหน้าใหม่" }, { status: 404 });
    // Only inventory-sheet fields are editable here. Existing storefront settings are preserved.
    const items = await saveProduct({
      name: text("name"), thai: text("name"), category: text("category"), tag: categoryLabels[text("category")],
      sku: text("sku"), cost: body.cost, notes: text("description"), description: text("description"), images: [text("imageUrl")],
      color: text("color"), size: text("size"), dailyRate: body.dailyRate, deposit: body.deposit, stock: body.stock, active: body.active,
      inventoryStatus: existing?.inventoryStatus ?? "อยู่ที่ร้าน",
    }, body.id);
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ products: items });
  } catch { return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
}
