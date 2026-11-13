import { unitsOf, type Product, type ProductVariant } from "@/lib/products";
import { isProductImage } from "@/lib/product-images";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { createProduct, createProductCategory, createProductColor, getProductCategories, getProducts, mergeProducts, resetProductColors, updateProduct, updateProductColor, type ProductFields, type ProductMergeRow } from "@/lib/product-store";
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
  if (body.action === "product.merge") {
    const text = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
    const sku = text("sku").toUpperCase(), name = text("name"), category = text("category");
    const rawRows = (Array.isArray(body.rows) ? body.rows : []) as Record<string, unknown>[];
    const rows = rawRows.map(row => ({ sourceProductId: Number(row.sourceProductId), color: typeof row.color === "string" ? row.color.trim() : "", colorCode: typeof row.colorCode === "string" ? row.colorCode.trim().toUpperCase() : "", size: typeof row.size === "string" ? row.size.trim() : "", cost: row.cost === null || row.cost === undefined ? null : Number(row.cost) }));
    const categories = await getProductCategories(), categoryLabels = Object.fromEntries(categories.map(item => [item, item]));
    const validRows = rows.length >= 2 && rows.length <= 100 && new Set(rows.map(row => row.sourceProductId)).size === rows.length && rows.every(row => Number.isSafeInteger(row.sourceProductId) && row.sourceProductId > 0 && row.color.length <= 100 && row.size.length <= 100 && /^[A-Z0-9]{0,2}$/.test(row.colorCode) && (row.color || row.size) && (row.cost === null || typeof row.cost === "number" && Number.isFinite(row.cost) && row.cost >= 0)) && new Set(rows.map(row => `${row.colorCode}:${row.size.toUpperCase()}`)).size === rows.length;
    if (!name || name.length > 3000 || !Object.hasOwn(categoryLabels, category) || (sku && !/^\S{1,50}$/.test(sku)) || !validRows) return Response.json({ error: "กรุณาตรวจสอบข้อมูลสินค้าที่จะรวม" }, { status: 400 });
    const db = await database(), sources = await db.collection<Product>("products").find({ id: { $in: rows.map(row => row.sourceProductId) }, deletedAt: { $exists: false } }, { projection: { _id: 0 } }).toArray();
    if (sources.length !== rows.length) return Response.json({ error: "พบสินค้าต้นทางบางรายการไม่อยู่แล้ว กรุณาโหลดหน้าใหม่" }, { status: 409 });
    const first = sources[0];
    const fields: ProductFields = {
      name, thai: name, category, tag: categoryLabels[category], color: "", size: "", dailyRate: first.dailyRate ?? null, deposit: first.deposit ?? null, depositRequired: first.depositRequired === true,
      description: first.description || "", notes: first.notes || first.description || "", images: first.images?.length ? first.images : first.image ? [first.image] : [], active: true,
      customPricing: first.customPricing ?? null, shippingFee: first.shippingFee ?? null, gapDays: first.gapDays ?? null, variants: [],
    };
    try {
      const merged = await mergeProducts(fields, rows as ProductMergeRow[], sku || undefined);
      await audit(request, auth.admin, { action: "product.merge", targetType: "product", targetId: String(merged.id), summary: `รวมสินค้า ${rows.map(row => sources.find(source => source.id === row.sourceProductId)?.sku || row.sourceProductId).join(", ")} เป็น ${merged.code}`, changes: [{ field: "sources", before: rows.map(row => row.sourceProductId), after: merged.id }] });
      revalidateTag("catalog", { expire: 0 });
      return Response.json({ products: await getProducts() });
    } catch (error) {
      if (error instanceof Error && error.message === "MERGE_HAS_BOOKINGS") return Response.json({ error: "รวมไม่ได้ เพราะสินค้าต้นทางมีรายการจองที่ยังไม่ยกเลิก" }, { status: 409 });
      if (error instanceof Error && error.message === "SKU_TAKEN") return Response.json({ error: "รหัสสินค้าแม่นี้ถูกใช้แล้ว กรุณาใช้รหัสอื่น" }, { status: 409 });
      if (error instanceof Error && error.message === "MERGE_SOURCE_NOT_FOUND") return Response.json({ error: "สินค้าต้นทางเปลี่ยนแปลง กรุณาโหลดหน้าใหม่" }, { status: 409 });
      return Response.json({ error: "รวมสินค้าไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    }
  }
  if (body.action === "category.create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return Response.json({ error: "ชื่อหมวดหมู่ต้องมี 1–100 ตัวอักษร" }, { status: 400 });
    try {
      const categories = await createProductCategory(name);
      await audit(request, auth.admin, { action: "product.category_create", targetType: "product_category", targetId: name, summary: `เพิ่มหมวดหมู่ ${name}`, changes: [] });
      return Response.json({ categories });
    } catch (error) {
      if (error instanceof Error && error.message === "CATEGORY_TAKEN") return Response.json({ error: "มีหมวดหมู่นี้อยู่แล้ว" }, { status: 409 });
      return Response.json({ error: "เพิ่มหมวดหมู่ไม่สำเร็จ" }, { status: 500 });
    }
  }
  if (body.action === "color.create") {
    const color = typeof body.color === "string" ? body.color.trim() : "", colorCode = typeof body.colorCode === "string" ? body.colorCode.trim().toUpperCase() : "";
    try {
      const colors = await createProductColor(color, colorCode);
      await audit(request, auth.admin, { action: "product.color_create", targetType: "product_color", targetId: color, summary: `เพิ่มสี ${color} (${colorCode})`, changes: [] });
      return Response.json({ colors });
    } catch (error) {
      if (error instanceof Error && error.message === "COLOR_TAKEN") return Response.json({ error: "มีสีนี้อยู่แล้ว" }, { status: 409 });
      return Response.json({ error: "กรุณาระบุชื่อสีและรหัสสี 1–2 ตัวอักษรภาษาอังกฤษ/ตัวเลข" }, { status: 400 });
    }
  }
  if (body.action === "color.update") {
    const color = typeof body.color === "string" ? body.color.trim() : "", colorCode = typeof body.colorCode === "string" ? body.colorCode.trim().toUpperCase() : "";
    try { return Response.json({ colors: await updateProductColor(color, colorCode) }); }
    catch { return Response.json({ error: "กรุณาระบุรหัสสี 1–2 ตัวอักษรภาษาอังกฤษ/ตัวเลข" }, { status: 400 }); }
  }
  if (body.action === "color.reset") {
    await resetProductColors();
    await audit(request, auth.admin, { action: "product.color_reset", targetType: "product_color", targetId: "all", summary: "ล้างรายการสีและรหัสสีตั้งต้นทั้งหมด", changes: [] });
    return Response.json({ colors: [] });
  }
  const text = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
  const sku = text("sku").toUpperCase();
  const categories = await getProductCategories();
  const categoryLabels = Object.fromEntries(categories.map(category => [category, category]));
  const validAmount = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0;
  const images = Array.isArray(body.images) ? body.images.filter((image: unknown) => typeof image === "string" && image) : [];
  const rawVariants = (Array.isArray(body.variants) ? body.variants : []) as Record<string, unknown>[];
  const variants = rawVariants.map((variant: Record<string, unknown>, index: number) => ({ id: typeof variant.id === "string" ? variant.id.trim().toLowerCase() : `v${index + 1}`, color: typeof variant.color === "string" ? variant.color.trim() : "", colorCode: typeof variant.colorCode === "string" ? variant.colorCode.trim().toUpperCase() : "", size: typeof variant.size === "string" ? variant.size.trim() : "", images: Array.isArray(variant.images) ? variant.images.filter((image: unknown) => typeof image === "string" && image) : [], count: Number(variant.count), cost: variant.cost === null || variant.cost === undefined ? null : Number(variant.cost) }));
  const validVariants = variants.length >= 1 && variants.length <= 100 && new Set(variants.map(variant => variant.id)).size === variants.length && new Set(variants.map(variant => `${variant.colorCode}:${variant.size.toUpperCase()}`)).size === variants.length && variants.every(variant => /^[a-z0-9-]{1,40}$/.test(variant.id) && /^[A-Z0-9]{0,2}$/.test(variant.colorCode) && (variant.color || variant.size) && variant.color.length <= 100 && variant.size.length <= 100 && variant.images.length <= 12 && variant.images.every(isProductImage) && Number.isSafeInteger(variant.count) && variant.count >= 1 && variant.count <= 50 && validAmount(variant.cost));
  if ((sku && !/^\S{1,50}$/.test(sku)) || !text("name") || !Object.hasOwn(categoryLabels, text("category")) || !validAmount(body.dailyRate) || !validAmount(body.deposit) || typeof body.depositRequired !== "boolean" || typeof body.active !== "boolean" || ["name", "color", "size", "description"].some(key => text(key).length > 3000) || !images.length || images.length > 12 || !images.every(isProductImage) || (body.id !== undefined && (!Number.isSafeInteger(body.id) || body.id < 1)) || (rawVariants.length > 0 && !validVariants)) return Response.json({ error: "ข้อมูลสินค้าไม่ถูกต้อง หรือรหัสสินค้าไม่ถูกต้อง" }, { status: 400 });
  if (!(body.shippingFee === null || body.shippingFee === undefined || (Number.isSafeInteger(body.shippingFee) && body.shippingFee >= 0 && body.shippingFee <= 10000))) return Response.json({ error: "ค่าส่งเฉพาะสินค้าต้องเป็นจำนวนเต็มบาท" }, { status: 400 });
  if (!(body.gapDays === null || body.gapDays === undefined || (Number.isSafeInteger(body.gapDays) && body.gapDays >= 0 && body.gapDays <= 14))) return Response.json({ error: "Gap ของสินค้าต้องเป็นจำนวนเต็ม 0–14 วัน" }, { status: 400 });
  if (body.customPricing !== null && !validPricing(body.customPricing)) return Response.json({ error: "ตรวจสอบตารางราคาเฉพาะสินค้าอีกครั้ง" }, { status: 400 });
  if (body.id === undefined && !validVariants && (!Number.isSafeInteger(body.pieces) || body.pieces < 1 || body.pieces > 50 || !validAmount(body.cost))) return Response.json({ error: "กรุณาระบุจำนวนชิ้นเริ่มต้น 1–50 ชิ้น และต้นทุนต่อชิ้น" }, { status: 400 });
  const fields: ProductFields = {
    name: text("name"), thai: text("name"), category: text("category"), tag: categoryLabels[text("category")],
    color: text("color"), size: text("size"), dailyRate: body.dailyRate, deposit: body.deposit, depositRequired: body.depositRequired,
    description: text("description"), notes: text("description"), images: [...new Set<string>(images)], active: body.active,
    customPricing: body.customPricing?.tiers.length ? cleanPricing(body.customPricing) : null, shippingFee: body.shippingFee ?? null, gapDays: body.gapDays ?? null,
    ...(validVariants ? { variants: variants.map(({ id, color, colorCode, size, images }): ProductVariant => ({ id, color, colorCode, size, images: [...new Set(images)] })) } : {}),
  };
  const db = await database();
  try {
    if (body.id === undefined) {
      const pieces = validVariants ? variants.flatMap(variant => Array.from({ length: variant.count }, () => ({ cost: variant.cost, note: "", variantId: variant.id }))) : Array.from({ length: body.pieces }, () => ({ cost: body.cost, note: "" }));
      const created = await createProduct(fields, pieces, sku || undefined);
      await audit(request, auth.admin, { action: "product.create", targetType: "product", targetId: String(created.id), summary: `เพิ่มสินค้า ${created.code} ${fields.name} (${created.units.length} ชิ้น)`, changes: diff(null, { ...fields, stock: created.units.length }, ["name", "category", "dailyRate", "deposit", "depositRequired", "stock"]) });
    } else {
      const current = await db.collection<Product>("products").findOne({ id: body.id }, { projection: { _id: 0, sku: 1 } });
      const skuChanged = !!current && !!sku && sku !== current.sku;
      const activeBookings = skuChanged ? await db.collection<{ _id: string }>("bookingRequests").countDocuments({ status: { $ne: "cancelled" }, "items.id": body.id }) : 0;
      if (activeBookings && body.confirmSkuChange !== true) return Response.json({ code: "PRODUCT_IN_USE", bookingCount: activeBookings, error: `สินค้านี้มีรายการจองที่ยังไม่ยกเลิก ${activeBookings} รายการ หากเปลี่ยนรหัส รายการจองเดิมจะยังเก็บรหัสเดิมไว้ ต้องการดำเนินการต่อหรือไม่?` }, { status: 409 });
      const before = await updateProduct(body.id, fields, sku || undefined);
      const changes = diff({ ...before, sku: before.sku }, { ...fields, sku: sku || before.sku }, ["sku", "name", "category", "color", "size", "dailyRate", "customPricing", "deposit", "depositRequired", "shippingFee", "gapDays", "active", "description", "images"]);
      if (changes.length) await audit(request, auth.admin, { action: changes.some(change => ["dailyRate", "customPricing", "deposit"].includes(change.field)) ? "product.price" : "product.update", targetType: "product", targetId: String(body.id), summary: `แก้ไขสินค้า ${before.sku || ""} ${fields.name}`.trim(), changes });
    }
    revalidateTag("catalog", { expire: 0 });
    return Response.json({ products: await getProducts() });
  } catch (error) {
    if (error instanceof Error && error.message === "SKU_TAKEN") return Response.json({ error: "รหัสสินค้านี้ถูกใช้แล้ว กรุณาใช้รหัสอื่น" }, { status: 409 });
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") return Response.json({ error: "ไม่พบสินค้า กรุณาโหลดหน้าใหม่" }, { status: 404 });
    return Response.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
