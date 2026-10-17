import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { database } from "./mongodb";
import { type Product } from "./products";
export async function getProducts(): Promise<Product[]> {
  await connection();
  const collection = (await database()).collection<Product>("products");
  const stored = await collection.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
  return stored;
}
export async function saveProduct(product: Omit<Product, "id" | "image">, existingId?: number) {
  const db = await database();
  const collection = db.collection<Product>("products");
  await collection.createIndex({ id: 1 }, { unique: true });
  if (existingId !== undefined) {
    const existing = await collection.findOne({ id: existingId });
    if (!existing) throw new Error("PRODUCT_NOT_FOUND");
    const legacyProfit = product.cost !== undefined && product.cost !== existing.cost ? { legacyProfit: product.cost == null || existing.legacyRevenue == null ? null : existing.legacyRevenue - product.cost } : {};
    await collection.updateOne({ id: existingId }, { $set: { ...product, ...legacyProfit } });
  } else {
    const counter = await db.collection<{ _id: string; sequence: number }>("counters").findOneAndUpdate(
      { _id: "products" }, [{ $set: { sequence: { $add: [{ $ifNull: ["$sequence", 0] }, 1] } } }], { upsert: true, returnDocument: "after" }
    );
    const id = counter!.sequence;
    await collection.insertOne({ ...product, legacyId: `PD-${randomUUID().slice(0,8)}`, id, image: `rental-${id}` });
  }
  return getProducts();
}
