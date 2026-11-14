import { connection } from "next/server";
import type { Db } from "mongodb";
import { database } from "./mongodb";
import { categoryLabels, inService, unitsOf, type Product, type ProductUnit, type ProductVariant, type UnitStatus } from "./products";
export async function getProducts(): Promise<Product[]> {
  await connection();
  return readProducts();
}
// No request-time API calls, so it is safe inside a "use cache" scope.
export async function readProducts(): Promise<Product[]> {
  const collection = (await database()).collection<Product>("products");
  const stored = await collection.find({ deletedAt: { $exists: false } }, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
  return stored.map(product => ({ ...product, color: product.color || product.variants?.map(variant => variant.color).filter(Boolean).join(" / ") || "", size: product.size || product.variants?.map(variant => variant.size).filter(Boolean).join(" / ") || "" }));
}

export async function getProductCategories() {
  const db = await database();
  const [used, saved] = await Promise.all([
    db.collection<Pick<Product, "category">>("products").distinct("category", { deletedAt: { $exists: false } }),
    db.collection<{ name: string }>("productCategories").find({}, { projection: { _id: 0, name: 1 } }).toArray(),
  ]);
  return [...new Set([...Object.keys(categoryLabels), ...used, ...saved.map(row => row.name)])].filter(Boolean).sort((a, b) => a.localeCompare(b, "th"));
}

export type ProductColorOption = { color: string; colorCode: string };
export async function getProductColors(): Promise<ProductColorOption[]> {
  const saved = await (await database()).collection<ProductColorOption>("productColors").find({}, { projection: { _id: 0 } }).toArray();
  return saved.filter(item => item.color).sort((a, b) => a.color.localeCompare(b.color, "th") || a.colorCode.localeCompare(b.colorCode));
}

export async function createProductColor(color: string, colorCode: string) {
  const db = await database();
  const value = { color: color.trim(), colorCode: colorCode.trim().toUpperCase() };
  if (!value.color || !/^[A-Z0-9]{1,2}$/.test(value.colorCode)) throw new Error("COLOR_INVALID");
  if (await db.collection<ProductColorOption>("productColors").findOne({ color: value.color })) throw new Error("COLOR_TAKEN");
  await db.collection<ProductColorOption>("productColors").insertOne(value);
  return db.collection<ProductColorOption>("productColors").find({}, { projection: { _id: 0 } }).sort({ color: 1 }).toArray();
}
export async function updateProductColor(color: string, colorCode: string) {
  const value = { color: color.trim(), colorCode: colorCode.trim().toUpperCase() };
  if (!value.color || !/^[A-Z0-9]{1,2}$/.test(value.colorCode)) throw new Error("COLOR_INVALID");
  const db = await database();
  await db.collection<ProductColorOption>("productColors").updateOne({ color: value.color }, { $set: value }, { upsert: true });
  return getProductColors();
}
export async function resetProductColors() {
  const db = await database();
  await db.collection<ProductColorOption>("productColors").deleteMany({});
  return [] as ProductColorOption[];
}

export async function createProductCategory(name: string) {
  const db = await database();
  const categories = await getProductCategories();
  if (categories.includes(name)) throw new Error("CATEGORY_TAKEN");
  await db.collection("productCategories").insertOne({ name, createdAt: new Date() });
  return getProductCategories();
}

export type ProductFields = Pick<Product, "name" | "thai" | "category" | "tag" | "color" | "size" | "dailyRate" | "deposit" | "depositRequired" | "description" | "notes" | "images" | "active" | "customPricing" | "shippingFee" | "gapDays" | "variants">;
const products = (db: Db) => db.collection<Product>("products");
const round = (value: number) => Math.round(value * 100) / 100;
const total = (values: (number | null | undefined)[]) => values.some(value => typeof value === "number") ? round(values.reduce<number>((sum, value) => sum + (value || 0), 0)) : null;
// Stock counts pieces still in service (ready, out on rent or being prepared); cost and legacy totals cover every piece the shop has owned.
export const derived = (units: ProductUnit[]) => ({
  stock: units.filter(unit => inService(unit.status)).length,
  cost: total(units.map(unit => unit.cost)),
  legacyRevenue: total(units.map(unit => unit.legacyRevenue)),
  legacyProfit: total(units.map(unit => unit.legacyProfit)),
});
const pieceNumber = (sku: string, code: string) => sku.startsWith(`${code}-`) ? Number(sku.slice(code.length + 1)) || 0 : 0;
const pieceCode = (code: string, number: number) => `${code}-${String(number).padStart(2, "0")}`;
const variantUnitCode = (productCode: string, variant: { id: string; colorCode?: string; size: string }) => `${productCode}-${(variant.colorCode || variant.id).toUpperCase()}${variant.size ? `-${variant.size.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12)}` : ""}`;

async function skuTaken(db: Db, sku: string, excludeId?: number) { return !!await products(db).findOne({ $and: [{ $or: [{ "units.sku": sku }, { sku }] }, ...(excludeId === undefined ? [] : [{ id: { $ne: excludeId } }])] }, { projection: { _id: 1 } }); }
async function activeSkuTaken(db: Db, sku: string, excludeId?: number) { return !!await products(db).findOne({ $and: [{ deletedAt: { $exists: false } }, { $or: [{ "units.sku": sku }, { sku }] }, ...(excludeId === undefined ? [] : [{ id: { $ne: excludeId } }])] }, { projection: { _id: 1 } }); }
// Next free product code: A0330, A0331… The counter is seeded by the merge script.
async function nextProductCode(db: Db) {
  for (;;) {
    const counter = await db.collection<{ _id: string; sequence: number }>("counters").findOneAndUpdate({ _id: "productCodes" }, { $inc: { sequence: 1 } }, { upsert: true, returnDocument: "after" });
    const code = `A${String(counter!.sequence).padStart(4, "0")}`;
    if (!await products(db).findOne({ $or: [{ sku: code }, { "units.sku": { $regex: `^${code}(-|$)` } }] }, { projection: { _id: 1 } })) return code;
  }
}

export async function createProduct(fields: ProductFields, pieces: { cost: number | null; note: string; variantId?: string }[], requestedSku?: string) {
  const db = await database();
  await products(db).createIndex({ id: 1 }, { unique: true });
  const counter = await db.collection<{ _id: string; sequence: number }>("counters").findOneAndUpdate(
    { _id: "products" }, [{ $set: { sequence: { $add: [{ $ifNull: ["$sequence", 0] }, 1] } } }], { upsert: true, returnDocument: "after" }
  );
  const id = counter!.sequence, code = requestedSku || await nextProductCode(db), now = new Date();
  if (await skuTaken(db, code)) throw new Error("SKU_TAKEN");
  const counters = new Map<string, number>();
  const units: ProductUnit[] = pieces.map(piece => {
    const variant = piece.variantId && piece.variantId !== "legacy" ? fields.variants?.find(item => item.id === piece.variantId) : null;
    const unitCode = variant ? variantUnitCode(code, variant) : code;
    const number = (counters.get(unitCode) || 0) + 1; counters.set(unitCode, number);
    return { sku: pieceCode(unitCode, number), cost: piece.cost, status: "available", note: piece.note, addedAt: now, ...(piece.variantId ? { variantId: piece.variantId } : {}) };
  });
  await products(db).insertOne({ ...fields, sku: code, units, ...derived(units), legacyId: `PD-${code}`, id, image: `rental-${id}`, inventoryStatus: "อยู่ที่ร้าน" });
  return { id, code, units };
}

export type ProductMergeRow = { sourceProductId: number; color: string; colorCode: string; size: string; cost: number | null };

// Converts one legacy product in place. Keeping the same id and SKU means existing bookings do not need to be rewritten.
export async function convertProduct(fields: ProductFields, row: ProductMergeRow) {
  const db = await database();
  const existing = await products(db).findOne({ id: row.sourceProductId, deletedAt: { $exists: false } });
  if (!existing) throw new Error("MERGE_SOURCE_NOT_FOUND");
  const variant = { id: "v1", color: row.color.trim(), colorCode: row.colorCode.trim().toUpperCase(), size: row.size.trim(), images: existing.images?.length ? [...new Set(existing.images)] : existing.image ? [existing.image] : [] };
  const sourceUnits = existing.units?.length ? existing.units : existing.stock ? unitsOf(existing).slice(0, existing.stock) : [];
  const units = sourceUnits.map(unit => ({ ...unit, cost: row.cost ?? unit.cost, variantId: variant.id }));
  const next: Product = { ...existing, ...fields, sku: existing.sku, color: variant.color, size: variant.size, variants: [{ ...variant, cost: row.cost ?? units[0]?.cost ?? null }], images: variant.images, image: variant.images[0] || existing.image, units, ...derived(units) };
  await products(db).replaceOne({ id: existing.id }, next);
  return { id: existing.id, code: existing.sku || String(existing.id), units, sources: [existing] };
}

// Creates a new parent while retaining the old product documents for historical orders.
export async function mergeProducts(fields: ProductFields, rows: ProductMergeRow[], requestedSku?: string) {
  const db = await database();
  const sourceIds = rows.map(row => row.sourceProductId);
  const sources = await products(db).find({ id: { $in: sourceIds }, deletedAt: { $exists: false } }).sort({ id: 1 }).toArray();
  if (sources.length !== sourceIds.length) throw new Error("MERGE_SOURCE_NOT_FOUND");
  const code = requestedSku || await nextProductCode(db), now = new Date();
  const conflictingSku = await products(db).findOne({ $and: [{ $or: [{ sku: code }, { "units.sku": code }] }, { id: { $nin: sourceIds } }] }, { projection: { _id: 1 } });
  if (conflictingSku) throw new Error("SKU_TAKEN");
  const variants = rows.map((row, index) => {
    const source = sources.find(item => item.id === row.sourceProductId)!;
    const images = source.images?.length ? source.images : source.image ? [source.image] : [];
    return { id: `v${index + 1}`, color: row.color.trim(), colorCode: row.colorCode.trim().toUpperCase(), size: row.size.trim(), images: [...new Set(images)] };
  });
  const counters = new Map<string, number>();
  const unitSkuMap = new Map<string, string>();
  const occupiedUnitSkus = new Set((await products(db).find({}, { projection: { _id: 0, sku: 1, "units.sku": 1 } }).toArray()).flatMap(product => [product.sku, ...(product.units || []).map(unit => unit.sku)]).filter((sku): sku is string => !!sku));
  const units: ProductUnit[] = rows.flatMap((row, index) => {
    const source = sources.find(item => item.id === row.sourceProductId)!;
    const variant = variants[index], unitCode = variantUnitCode(code, variant);
    const sourceUnits = source.units?.length ? source.units : Array.from({ length: Math.max(1, source.stock ?? 1) }, (_, unitIndex) => {
      const legacy = unitsOf(source)[0];
      return { ...legacy, sku: unitIndex === 0 ? legacy.sku || pieceCode(unitCode, 1) : pieceCode(unitCode, unitIndex + 1) };
    });
    return sourceUnits.map(unit => {
      let number = (counters.get(unitCode) || 0) + 1, sku = pieceCode(unitCode, number);
      while (occupiedUnitSkus.has(sku)) { number += 1; sku = pieceCode(unitCode, number); }
      counters.set(unitCode, number);
      occupiedUnitSkus.add(sku);
      if (unit.sku) unitSkuMap.set(unit.sku, sku);
      return { ...unit, sku, legacyId: unit.legacyId || unit.sku, cost: row.cost, variantId: variant.id, legacyProductId: source.id };
    });
  });
  const idCounter = await db.collection<{ _id: string; sequence: number }>("counters").findOneAndUpdate(
    { _id: "products" }, [{ $set: { sequence: { $add: [{ $ifNull: ["$sequence", 0] }, 1] } } }], { upsert: true, returnDocument: "after" }
  );
  const id = idCounter!.sequence;
  const safeUnits = units.map((unit, index) => ({ ...unit, sku: typeof unit.sku === "string" && unit.sku.trim() ? unit.sku : pieceCode(`${code}-LEGACY`, index + 1) }));
  const first = sources[0], images = variants[0]?.images || first.images || (first.image ? [first.image] : []);
  const product: Product = { ...fields, color: variants.map(variant => variant.color).filter(Boolean).join(" / "), size: variants.map(variant => variant.size).filter(Boolean).join(" / "), variants, images, image: images[0] || `rental-${id}`, sku: code, id, legacyId: `PD-${code}`, inventoryStatus: "อยู่ที่ร้าน", units: safeUnits, ...derived(safeUnits) };
  await products(db).insertOne(product);

  // Move references before hiding the source products. Keep the old item
  // snapshot (name/sku/image) in a booking so historical bills remain unchanged.
  const variantBySource = new Map(rows.map((row, index) => [row.sourceProductId, variants[index].id]));
  const bookingCollection = db.collection<{ _id: string; items?: { id: number; variantId?: string; unitSku?: string }[] }>("bookingRequests");
  const bookings = await bookingCollection
    .find({ "items.id": { $in: sourceIds } }, { projection: { _id: 1, items: 1 } }).toArray();
  if (bookings.length) await bookingCollection.bulkWrite(bookings.map(booking => ({
    updateOne: {
      filter: { _id: booking._id },
      update: { $set: { items: (booking.items || []).map(item => { const variantId = variantBySource.get(item.id); const unitSku = item.unitSku ? unitSkuMap.get(item.unitSku) || item.unitSku : undefined; return variantId ? { ...item, id, variantId, ...(unitSku ? { unitSku } : {}) } : item; }) } },
    },
  })));

  await db.collection("rentalItems").updateMany({ productId: { $in: sourceIds } }, { $set: { productId: id } });

  const availability = db.collection<{ productId: number; date: string; capacity: number; updatedAt?: Date; updatedBy?: string }>("productAvailability");
  const oldAvailability = await availability.find({ productId: { $in: sourceIds } }).toArray();
  if (oldAvailability.length) {
    const byDate = new Map<string, number>();
    for (const row of oldAvailability) byDate.set(row.date, (byDate.get(row.date) || 0) + row.capacity);
    await availability.deleteMany({ productId: { $in: sourceIds } });
    await availability.insertMany([...byDate].map(([date, capacity]) => ({ productId: id, date, capacity, updatedAt: now })));
  }

  await products(db).updateMany({ id: { $in: sourceIds }, deletedAt: { $exists: false } }, { $set: { active: false, deletedAt: now, mergedIntoId: id, mergedIntoSku: code } });
  return { id, code, units: safeUnits, sources };
}

type ProductVariantUpdate = ProductVariant & { count: number; cost: number | null; costMixed?: boolean };

export async function updateProduct(id: number, fields: ProductFields, requestedSku?: string, variantUpdates?: ProductVariantUpdate[]) {
  const db = await database();
  const existing = await products(db).findOne({ id });
  if (!existing) throw new Error("PRODUCT_NOT_FOUND");
  if (requestedSku && requestedSku !== existing.sku && await activeSkuTaken(db, requestedSku, id)) throw new Error("SKU_TAKEN");
  let units = unitsOf(existing);
  if (variantUpdates?.length) {
    const keptVariants = new Set(variantUpdates.map(variant => variant.id));
    if ((existing.variants || []).some(variant => !keptVariants.has(variant.id) && units.some(unit => unit.variantId === variant.id))) throw new Error("VARIANT_HAS_STOCK");
    const code = requestedSku || existing.sku || await nextProductCode(db);
    const nextUnits = [...units];
    for (const variant of variantUpdates) {
      const current = nextUnits.filter(unit => unit.variantId === variant.id && inService(unit.status));
      const removable = current.filter(unit => unit.status === "available" || unit.status === "unavailable");
      if (variant.count < current.length && variant.count < current.length - removable.length) throw new Error("VARIANT_COUNT_BOOKED");
      if (variant.count < current.length) {
        const remove = current.length - variant.count;
        const removableSkus = new Set(removable.slice(-remove).map(unit => unit.sku));
        for (let index = 0; index < nextUnits.length; index++) if (removableSkus.has(nextUnits[index].sku)) nextUnits[index] = { ...nextUnits[index], status: "retired" };
      } else if (variant.count > current.length) {
        const unitCode = variantUnitCode(code, variant);
        let number = Math.max(0, ...nextUnits.filter(unit => unit.variantId === variant.id).map(unit => pieceNumber(unit.sku, unitCode)));
        while (nextUnits.filter(unit => unit.variantId === variant.id && inService(unit.status)).length < variant.count) {
          const sku = pieceCode(unitCode, ++number);
          if (!nextUnits.some(unit => unit.sku === sku) && !await skuTaken(db, sku)) nextUnits.push({ sku, cost: variant.cost, status: "available", note: "", addedAt: new Date(), variantId: variant.id });
        }
      }
      if (!variant.costMixed) for (let index = 0; index < nextUnits.length; index++) if (nextUnits[index].variantId === variant.id && inService(nextUnits[index].status)) nextUnits[index] = { ...nextUnits[index], cost: variant.cost };
    }
    units = nextUnits;
  }
  await products(db).updateOne({ id }, { $set: { ...fields, ...(requestedSku ? { sku: requestedSku } : {}), units, ...derived(units) } });
  return existing;
}

export async function migrateProductSkuReferences(id: number, fromSku: string, toSku: string) {
  if (!fromSku || fromSku === toSku) return { bookings: 0, rentalItems: 0 };
  const db = await database();
  const [bookings, rentalItems] = await Promise.all([
    db.collection("bookingRequests").updateMany({ "items.id": id }, { $set: { "items.$[item].sku": toSku } }, { arrayFilters: [{ "item.id": id }] }),
    db.collection("rentalItems").updateMany({ productId: id }, { $set: { sku: toSku } }),
  ]);
  return { bookings: bookings.modifiedCount, rentalItems: rentalItems.modifiedCount };
}

// Restocking: new pieces continue the product's numbering (A0002-09, A0002-10…).
export async function addUnits(id: number, count: number, cost: number | null, note: string, variantId?: string) {
  const db = await database();
  const existing = await products(db).findOne({ id });
  if (!existing) throw new Error("PRODUCT_NOT_FOUND");
  const units = unitsOf(existing);
  const code = existing.sku?.match(/^[A-Z]+\d+$/) ? existing.sku : await nextProductCode(db);
  const scoped = variantId ? units.filter(unit => unit.variantId === variantId) : units;
  const variant = variantId && variantId !== "legacy" ? existing.variants?.find(item => item.id === variantId) : null;
  const unitCode = variant ? variantUnitCode(code, variant) : code;
  let number = Math.max(0, ...scoped.map(unit => pieceNumber(unit.sku, unitCode)));
  const added: ProductUnit[] = [];
  while (added.length < count) {
    const sku = pieceCode(unitCode, ++number);
    if (!await skuTaken(db, sku)) added.push({ sku, cost, status: "available", note, addedAt: new Date(), ...(variantId ? { variantId } : {}) });
  }
  const next = [...units, ...added];
  const result = await products(db).updateOne({ id, "units.sku": { $nin: added.map(unit => unit.sku) } }, { $set: { sku: code, units: next, ...derived(next) } });
  if (!result.modifiedCount) throw new Error("PRODUCT_CHANGED");
  return { before: existing, added, units: next };
}

export async function updateUnit(id: number, sku: string, patch: { cost: number | null; status: UnitStatus; note: string }) {
  const db = await database();
  const existing = await products(db).findOne({ id });
  if (!existing) throw new Error("PRODUCT_NOT_FOUND");
  const units = unitsOf(existing);
  const before = units.find(unit => unit.sku === sku);
  if (!before) throw new Error("UNIT_NOT_FOUND");
  const after = { ...before, ...patch, legacyProfit: before.legacyRevenue == null ? before.legacyProfit ?? null : round(before.legacyRevenue - (patch.cost || 0)) };
  const next = units.map(unit => unit.sku === sku ? after : unit);
  await products(db).updateOne({ id }, { $set: { units: next, ...derived(next) } });
  return { before, after, units: next };
}

export async function deleteUnit(id: number, sku: string) {
  const db = await database();
  const existing = await products(db).findOne({ id });
  if (!existing) throw new Error("PRODUCT_NOT_FOUND");
  if (!existing.units?.length) throw new Error("UNIT_REQUIRED");
  const before = existing.units.find(unit => unit.sku === sku);
  if (!before) throw new Error("UNIT_NOT_FOUND");
  if (before.status !== "retired" && before.status !== "unavailable") throw new Error("UNIT_ACTIVE");
  const next = existing.units.filter(unit => unit.sku !== sku);
  const result = await products(db).updateOne({ id, "units.sku": sku }, { $set: { units: next, ...derived(next) } });
  if (!result.modifiedCount) throw new Error("PRODUCT_CHANGED");
  return { before, units: next };
}

// Moves pieces (by piece code, across products) to a new status; returns each piece's status before the change.
export async function setUnitStatuses(db: Db, changes: { sku: string; status: UnitStatus; note?: string }[]) {
  const before = new Map<string, { productId: number; name: string; status: UnitStatus; note: string }>();
  if (!changes.length) return before;
  const bySku = new Map(changes.map(change => [change.sku, change]));
  for (const product of await products(db).find({ "units.sku": { $in: [...bySku.keys()] } }).toArray()) {
    const units = unitsOf(product).map(unit => {
      const change = bySku.get(unit.sku);
      if (!change) return unit;
      before.set(unit.sku, { productId: product.id, name: product.name, status: unit.status, note: unit.note });
      return { ...unit, status: change.status, note: change.note ?? unit.note };
    });
    await products(db).updateOne({ id: product.id }, { $set: { units, ...derived(units) } });
  }
  return before;
}

// Old rental history points at the pre-merge product's legacyId, which now lives on one of a product's pieces.
export async function productsByLegacyIds(db: Db, legacyIds: string[]) {
  const map = new Map<string, Product>();
  if (!legacyIds.length) return map;
  const rows = await products(db).find({ $or: [{ legacyId: { $in: legacyIds } }, { "units.legacyId": { $in: legacyIds } }] }, { projection: { _id: 0, legacyId: 1, name: 1, sku: 1, image: 1, images: 1, imageStatus: 1, units: 1 } }).toArray();
  for (const product of rows) {
    if (product.legacyId) map.set(product.legacyId, product);
    for (const unit of product.units || []) if (unit.legacyId) map.set(unit.legacyId, { ...product, images: unit.image ? [unit.image, ...product.images.filter(image => image !== unit.image)] : product.images, sku: unit.sku });
  }
  return map;
}
