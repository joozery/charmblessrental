import { Suspense } from "react";
import Link from "next/link";
import { pageAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { productsByLegacyIds } from "@/lib/product-store";
import RentalHistory from "./rental-history";
import "./rental-history.css";

export const metadata = { title: "ประวัติการเช่า | Charm Bless", robots: { index: false, follow: false } };

type Rental = {
  legacyId: string; enteredAt?: Date | string | null; legacyStatus?: string; customerName?: string; phone?: string; address?: string;
  shipDate?: Date | string | null; returnDate?: Date | string | null; rentalDateText?: string; days?: number | null;
  rentalTotal?: number | null; deposit?: number | null; shipping?: number | null; total?: number | null; bankId?: string;
  paidAt?: Date | string | null; slips?: string[]; carrier?: string; notes?: string; detailUrl?: string; enteredBy?: string;
};
type RentalItem = { rentalId: string; productLegacyId?: string; sku?: string; productName?: string; agreedPrice?: number | null; notes?: string };
type Query = { q?: string | string[]; status?: string | string[]; from?: string | string[]; to?: string | string[]; page?: string | string[] };
type SearchParams = Promise<Query>;
const one = (value?: string | string[]) => Array.isArray(value) ? value[0] : value || "";
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function Content({ searchParams }: { searchParams: SearchParams }) {
  await pageAdmin("rentals");
  const query = await searchParams;
  const q = one(query.q).trim().slice(0, 100);
  const status = one(query.status);
  const from = validDate(one(query.from)) ? one(query.from) : "";
  const to = validDate(one(query.to)) ? one(query.to) : "";
  const reversedRange = !!from && !!to && from > to;
  const pageSize = 25;
  const requestedPage = Math.max(1, Math.min(10000, Number.parseInt(one(query.page) || "1", 10) || 1));
  const db = await database();
  const collection = db.collection<Rental>("rentals");
  const filter: Record<string, unknown> = {};
  if (status && status !== "all") filter.legacyStatus = status;
  if (!reversedRange && (from || to)) {
    const enteredAt: Record<string, Date> = {};
    if (from) enteredAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) enteredAt.$lt = new Date(`${nextDay(to)}T00:00:00.000Z`);
    filter.enteredAt = enteredAt;
  }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ legacyId: pattern }, { customerName: pattern }, { phone: pattern }];
  }
  const [total, allCount, pendingCount, shippingCount, overdueCount] = await Promise.all([
    collection.countDocuments(filter),
    collection.countDocuments(),
    collection.countDocuments({ legacyStatus: "รอชำระเงิน" }),
    collection.countDocuments({ legacyStatus: "รอจัดส่ง" }),
    collection.countDocuments({ legacyStatus: "เกินกำหนดส่ง" }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const rentals = await collection.find(filter, { projection: { _id: 0 } }).sort({ enteredAt: -1, legacyId: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
  const ids = rentals.map(rental => rental.legacyId);
  const rentalItems = ids.length ? await db.collection<RentalItem>("rentalItems").find({ rentalId: { $in: ids } }, { projection: { _id: 0 } }).toArray() : [];
  const productIds = [...new Set(rentalItems.map(item => item.productLegacyId).filter((id): id is string => !!id))];
  const productsByLegacyId = await productsByLegacyIds(db, productIds);
  const itemsByRental = new Map<string, { productName: string; sku: string; agreedPrice: number | null; notes: string; image?: string }[]>();
  for (const item of rentalItems) {
    const product = productsByLegacyId.get(item.productLegacyId || "");
    const list = itemsByRental.get(item.rentalId) || [];
    list.push({ productName: item.productName || product?.name || "สินค้าเดิม", sku: item.sku || product?.sku || "", agreedPrice: item.agreedPrice ?? null, notes: item.notes || "", image: product?.imageStatus === "missing-source" ? undefined : product?.images?.[0] || product?.image || undefined });
    itemsByRental.set(item.rentalId, list);
  }
  const serializeDate = (value?: Date | string | null) => { if (!value) return ""; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString(); };
  const records = rentals.map(rental => ({ ...rental, enteredAt: serializeDate(rental.enteredAt), shipDate: serializeDate(rental.shipDate), returnDate: serializeDate(rental.returnDate), paidAt: serializeDate(rental.paidAt), items: itemsByRental.get(rental.legacyId) || [] }));
  const buildHref = (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(next));
    return `/admin/rentals?${params.toString()}`;
  };

  return <main className="admin-main rental-history-page">
    <header className="rental-history-header"><div><span className="rental-history-eyebrow">RENTAL RECORDS</span><h1>ประวัติการเช่า</h1><p>ค้นหารายการย้อนหลังจากข้อมูลแท็บ “ข้อมูลการเช่า”</p></div><span className="rental-history-source"><span />ข้อมูลต้นฉบับในระบบ</span></header>
    <section className="rental-history-stats" aria-label="สรุปจำนวนรายการเช่า">
      <article><span>รายการเช่าทั้งหมด</span><strong>{allCount.toLocaleString("th-TH")}</strong></article>
      <article className="is-pending"><span>รอชำระเงิน</span><strong>{pendingCount.toLocaleString("th-TH")}</strong></article>
      <article className="is-shipping"><span>รอจัดส่ง</span><strong>{shippingCount.toLocaleString("th-TH")}</strong></article>
      <article className="is-overdue"><span>เกินกำหนดส่ง</span><strong>{overdueCount.toLocaleString("th-TH")}</strong></article>
    </section>
    {reversedRange && <p className="rental-history-error" role="alert">วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น</p>}
    <section className="rental-history-panel" aria-labelledby="rental-list-title">
      <div className="rental-history-panel-head"><div><span className="rental-history-eyebrow">ALL RENTALS</span><h2 id="rental-list-title">รายการเช่าทั้งหมด</h2></div><span>{total.toLocaleString("th-TH")} รายการ</span></div>
      <form className="rental-history-filters" action="/admin/rentals" method="get">
        <label className="rental-history-search"><span>ค้นหา</span><input name="q" type="search" defaultValue={q} placeholder="เลขรายการ ชื่อลูกค้า หรือเบอร์โทร" maxLength={100} /></label>
        <label><span>สถานะ</span><select name="status" defaultValue={status || "all"}><option value="all">ทุกสถานะ</option><option value="รอชำระเงิน">รอชำระเงิน</option><option value="รอจัดส่ง">รอจัดส่ง</option><option value="เกินกำหนดส่ง">เกินกำหนดส่ง</option></select></label>
        <label><span>ลงข้อมูลตั้งแต่</span><input type="date" name="from" defaultValue={from} /></label>
        <label><span>ถึงวันที่</span><input type="date" name="to" defaultValue={to} /></label>
        <button type="submit">ค้นหารายการ</button>
        {(q || status || from || to) && <Link href="/admin/rentals">ล้างตัวกรอง</Link>}
      </form>
      <RentalHistory records={records} />
      <footer className="rental-history-footer"><span>แสดง {rentals.length ? ((page - 1) * pageSize + 1).toLocaleString("th-TH") : "0"}–{Math.min(page * pageSize, total).toLocaleString("th-TH")} จาก {total.toLocaleString("th-TH")} รายการ</span><nav aria-label="เปลี่ยนหน้ารายการ">{page > 1 && <Link href={buildHref(page - 1)}>‹ ก่อนหน้า</Link>}<span>หน้า {page.toLocaleString("th-TH")} / {pageCount.toLocaleString("th-TH")}</span>{page < pageCount && <Link href={buildHref(page + 1)}>ถัดไป ›</Link>}</nav></footer>
    </section>
    <p className="rental-history-note">ค้นหาวันที่จาก “วันที่ลงข้อมูล” · รายละเอียดลูกค้าและไฟล์แนบจะแสดงเฉพาะแอดมินที่เข้าสู่ระบบ</p>
  </main>;
}

function nextDay(day: string) {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดประวัติการเช่า…</main>}><Content searchParams={searchParams} /></Suspense>;
}
