import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import DiscountsManager from "./discounts-manager";
import { discountCoupons } from "@/lib/discounts";
import { database } from "@/lib/mongodb";
import "./discounts.css";

type Query = { page?: string | string[] };
const one = (value?: string | string[]) => Array.isArray(value) ? value[0] : value || "";
const pageSize = 20;
async function Content({ searchParams }: { searchParams: Promise<Query> }) {
  await pageAdmin("pricing");
  const params = await searchParams, requestedPage = Math.max(1, Number.parseInt(one(params.page), 10) || 1), db = await database(), collection = discountCoupons(db);
  const total = await collection.countDocuments(), pageCount = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(requestedPage, pageCount);
  const rows = await collection.find({}, { projection: { _id: 1, code: 1, label: 1, percent: 1, active: 1, startsAt: 1, endsAt: 1, maxUses: 1, usedCount: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
  return <DiscountsManager initial={rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} page={page} pageCount={pageCount} total={total} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Query> }) { return <Suspense fallback={<main className="admin-loading">กำลังโหลดส่วนลด…</main>}><Content searchParams={searchParams} /></Suspense>; }
