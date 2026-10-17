import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import type { Product } from "@/lib/products";

const validDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export async function GET(request: Request) {
  if (!await currentAdmin()) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDay(from) || !validDay(to) || from > to || (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 > 40) {
    return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
  }
  const lower = new Date(`${from}T00:00:00.000Z`);
  const upper = new Date(`${to}T00:00:00.000Z`);
  upper.setUTCDate(upper.getUTCDate() + 1);
  const db = await database();
  const rentals = await db.collection("rentals").find({ $or: [{ shipDate: { $gte: lower, $lt: upper } }, { returnDate: { $gte: lower, $lt: upper } }] }, { projection: { _id: 0, legacyId: 1, customerName: 1, shipDate: 1, returnDate: 1, enteredAt: 1, legacyStatus: 1, total: 1 } }).toArray();
  const ids = rentals.map(rental => rental.legacyId as string);
  const items = ids.length ? await db.collection("rentalItems").find({ rentalId: { $in: ids } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const productIds = [...new Set(items.map(item => item.productLegacyId).filter((id): id is string => typeof id === "string"))];
  const products = productIds.length ? await db.collection<Product>("products").find({ legacyId: { $in: productIds } }, { projection: { _id: 0, legacyId: 1, name: 1, sku: 1, image: 1, images: 1, imageStatus: 1 } }).toArray() : [];
  const productByLegacy = new Map(products.map(product => [product.legacyId, product]));
  const rentalsById = new Map(rentals.map(rental => [rental.legacyId, rental]));
  return NextResponse.json({ rentals: [...rentalsById.values()].map(rental => ({
    ...rental,
    items: items.filter(item => item.rentalId === rental.legacyId).map(item => {
      const product = productByLegacy.get(item.productLegacyId);
      return { productName: item.productName || product?.name, sku: item.sku || product?.sku, image: product?.imageStatus === "missing-source" ? undefined : product?.images?.[0] || product?.image || undefined };
    }),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
