import { Suspense } from "react";
import Link from "next/link";
import { pageAdmin } from "@/lib/admin-auth";
import { customers, creditEntries } from "@/lib/customer-credits";
import { database } from "@/lib/mongodb";
import CustomersManager from "./customers-manager";
import "./customers-layout.css";

export const metadata = { title: "ลูกค้าและเครดิต | Charm Bless", robots: { index: false, follow: false } };
type Query = { page?: string | string[] };
const one = (value?: string | string[]) => Array.isArray(value) ? value[0] : value || "";
async function Content({ searchParams }: { searchParams: Promise<Query> }) {
  await pageAdmin("bookings");
  const db = await database();
  const pageSize = 30, total = await customers(db).countDocuments(), pageCount = Math.max(1, Math.ceil(total / pageSize)), requestedPage = Math.max(1, Number.parseInt(one((await searchParams).page), 10) || 1), page = Math.min(requestedPage, pageCount);
  const rows = await customers(db).find({}).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
  const history = rows.length ? await creditEntries(db).find({ customerId: { $in: rows.map(row => row._id) } }).sort({ createdAt: -1 }).limit(5000).toArray() : [];
  return <><CustomersManager initial={rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} initialCredits={history.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), ...(row.expiresAt ? { expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt) } : {}) }))} total={total} /><nav className="admin-pagination customers-pagination" aria-label="เปลี่ยนหน้าลูกค้า">{pageCount > 1 && Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <Link key={number} href={`/admin/customers?page=${number}`} className={number === page ? "is-active" : ""}>{number}</Link>)}</nav></>;
}

export default function Page({ searchParams }: { searchParams: Promise<Query> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดข้อมูลลูกค้า…</main>}><Content searchParams={searchParams} /></Suspense>;
}
