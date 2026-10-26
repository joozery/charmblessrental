import { connection } from "next/server";
import type { Db } from "mongodb";
import { database } from "./mongodb";
import { inService, unitsOf, type Product, type ProductUnit, type UnitStatus } from "./products";
export async function getProducts(): Promise<Product[]> {
  await connection();
  return readProducts();
}
// No request-time API calls, so it is safe inside a "use cache" scope.
export async function readProducts(): Promise<Product[]> {
  const collection = (await database()).collection<Product>("products");
  const stored = await collection.find({ deletedAt: { $exists: false } }, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
  return stored;
}

export type ProductFields = Pick<Product, "name" | "thai" | "category" | "tag" | "color" | "size" | "dailyRate" | "deposit" | "depositRequired" | "description" | "notes" | "images" | "active" | "customPricing" | "shippingFee" | "gapDays">;
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

async function skuTaken(db: Db, sku: string) { return !!await products(db).findOne({ $or: [{ "units.sku": sku }, { sku }] }, { projection: { _id: 1 } }); }
// Next free product code: A0330, A0331… The counter is seeded by the merge script.
async function nextProductCode(db: Db) {
  for (;;) {
    const counter = await db.collection<{ _id: string; sequence: number }>("counters").findOneAndUpdate({ _id: "productCodes" }, { $inc: { sequence: 1 } }, { upsert: true, returnDocument: "after" });
    const code = `A${String(counter!.sequence).padStart(4, "0")}`;
    if (!await products(db).findOne({ $or: [{ sku: code }, { "units.sku": { $regex: `^${code}(-|$)` } }] }, { projection: { _id: 1 } })) return code;
  }
}

export async function createProduct(fields: ProductFields, pieces: { cost: number | null; note: string }[]) {
  const db = await database();
  await products(db).createIndex({ id: 1 }, { unique: true });
  const counter = await db.collection<{ _id: string; sequence: number }>("counters").findOneAndUpdate(
    { _id: "products" }, [{ $set: { sequence: { $add: [{ $ifNull: ["$sequence", 0] }, 1] } } }], { upsert: true, returnDocument: "after" }
  );
  const id = counter!.sequence, code = await nextProductCode(db), now = new Date();
  const units: ProductUnit[] = pieces.map((piece, index) => ({ sku: pieceCode(code, index + 1), cost: piece.cost, status: "available", note: piece.note, addedAt: now }));
  await products(db).insertOne({ ...fields, sku: code, units, ...derived(units), legacyId: `PD-${code}`, id, image: `rental-${id}`, inventoryStatus: "อยู่ที่ร้าน" });
  return { id, code, units };
}

export async function updateProduct(id: number, fields: ProductFields) {
  const db = await database();
  const existing = await products(db).findOne({ id });
  if (!existing) throw new Error("PRODUCT_NOT_FOUND");
  const units = unitsOf(existing);
  await products(db).updateOne({ id }, { $set: { ...fields, units, ...derived(units) } });
  return existing;
}

// Restocking: new pieces continue the product's numbering (A0002-09, A0002-10…).
export async function addUnits(id: number, count: number, cost: number | null, note: string) {
  const db = await database();
  const existing = await products(db).findOne({ id });
  if (!existing) throw new Error("PRODUCT_NOT_FOUND");
  const units = unitsOf(existing);
  const code = existing.sku?.match(/^[A-Z]+\d+$/) ? existing.sku : await nextProductCode(db);
  let number = Math.max(0, ...units.map(unit => pieceNumber(unit.sku, code)));
  const added: ProductUnit[] = [];
  while (added.length < count) {
    const sku = pieceCode(code, ++number);
    if (!await skuTaken(db, sku)) added.push({ sku, cost, status: "available", note, addedAt: new Date() });
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
