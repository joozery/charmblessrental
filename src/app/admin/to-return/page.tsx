import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { thaiDay } from "@/lib/finance";
import { database } from "@/lib/mongodb";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";
import { toReturnFilter } from "@/lib/to-return";
import { legacyItems, legacyPlan, legacyRentals } from "@/lib/legacy-rentals";
import { productsByLegacyIds } from "@/lib/product-store";
import ReturnBoard, { type ReturnRow } from "./return-board";
import "../to-ship/to-ship.css";

const PAGE_SIZE = 20;

export const metadata = { title: "รอส่งคืน | Charm Bless", robots: { index: false, follow: false } };

type BookingDoc = {
  _id: string; name: string; phone: string; method: string; start: string; end: string;
  schedule?: ScheduleRecord; items: { name: string; sku: string; image: string; unitSku?: string }[];
  customerReturn?: { carrier: string; trackingNumber: string; at: Date };
  photos?: { beforeShipment?: { url: string }[]; received?: { url: string }[]; return?: { url: string }[] };
};

async function Content({ page, query = "", tab = "all" }: { page: number; query?: string; tab?: string }) {
  await pageAdmin("shipping");
  const db = await database();
  const today = thaiDay();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const skip = Math.max(0, page - 1) * PAGE_SIZE;
  const text = query.trim();
  const webClauses: Record<string, unknown>[] = [];
  if (text) webClauses.push({ $or: [{ _id: { $regex: text, $options: "i" } }, { name: { $regex: text, $options: "i" } }, { phone: { $regex: text, $options: "i" } }, { "items.name": { $regex: text, $options: "i" } }, { "items.sku": { $regex: text, $options: "i" } }] });
  if (tab === "late") webClauses.push({ $or: [{ "schedule.returnDate": { $lt: today } }, { schedule: { $exists: false }, end: { $lt: today } }] });
  if (tab === "today") webClauses.push({ $or: [{ "schedule.returnDate": { $lte: tomorrow } }, { schedule: { $exists: false }, end: { $lte: tomorrow } }] });
  if (tab === "later") webClauses.push({ $or: [{ "schedule.returnDate": { $gt: tomorrow } }, { schedule: { $exists: false }, end: { $gt: tomorrow } }] });
  const webFilter = webClauses.length ? { $and: [toReturnFilter, ...webClauses] } : toReturnFilter;
  const legacyBase = { shipment: { $exists: true }, returned: { $exists: false }, cancelled: { $exists: false }, legacyStatus: { $in: ["จัดส่งแล้ว", "เกินกำหนดส่ง"] } };
  const legacyClauses: Record<string, unknown>[] = [];
  if (text) legacyClauses.push({ $or: [{ legacyId: { $regex: text, $options: "i" } }, { customerName: { $regex: text, $options: "i" } }, { phone: { $regex: text, $options: "i" } }] });
  if (tab === "late") legacyClauses.push({ returnDate: { $lt: new Date(`${today}T00:00:00.000Z`) } });
  if (tab === "today") legacyClauses.push({ returnDate: { $lte: new Date(`${tomorrow}T23:59:59.999Z`) } });
  if (tab === "later") legacyClauses.push({ returnDate: { $gt: new Date(`${tomorrow}T23:59:59.999Z`) } });
  const legacyFilter = legacyClauses.length ? { $and: [legacyBase, ...legacyClauses] } : legacyBase;
  const [bookings, legacy, bookingTotal, legacyTotal] = await Promise.all([db.collection<BookingDoc>("bookingRequests").find(webFilter, {
    projection: { _id: 1, name: 1, phone: 1, method: 1, start: 1, end: 1, schedule: 1, items: 1, customerReturn: 1, photos: 1 },
  }).sort({ "schedule.returnDate": 1, end: 1, _id: 1 }).limit(skip + PAGE_SIZE).toArray(), legacyRentals(db).find(legacyFilter, {
    projection: { _id: 0, legacyId: 1, customerName: 1, phone: 1, shipDate: 1, returnDate: 1, days: 1, shipment: 1 },
  }).sort({ returnDate: 1, legacyId: 1 }).limit(skip + PAGE_SIZE).toArray(), db.collection("bookingRequests").countDocuments(webFilter), legacyRentals(db).countDocuments(legacyFilter)]);
  const rows: ReturnRow[] = bookings.map(row => ({
    id: row._id, name: row.name, phone: row.phone, pickup: row.method === "pickup",
    returnDay: returnDay(row), start: row.start,
    items: row.items.map(item => ({ name: item.name, sku: item.unitSku || item.sku, image: item.image })),
    customerReturn: row.customerReturn ? { carrier: row.customerReturn.carrier, trackingNumber: row.customerReturn.trackingNumber, at: new Date(row.customerReturn.at).toISOString() } : null, photos: row.photos || {},
  })).sort((a, b) => a.returnDay.localeCompare(b.returnDay) || a.start.localeCompare(b.start));
  const legacyItemsRows = legacy.length ? await legacyItems(db).find({ rentalId: { $in: legacy.map(row => row.legacyId) } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const legacyItemsByRental = new Map<string, typeof legacyItemsRows>();
  for (const item of legacyItemsRows) legacyItemsByRental.set(item.rentalId, [...(legacyItemsByRental.get(item.rentalId) || []), item]);
  const products = await productsByLegacyIds(db, [...new Set(legacyItemsRows.map(item => item.productLegacyId).filter((id): id is string => !!id))]);
  for (const row of legacy) {
    const plan = legacyPlan(row, 0);
    if (!plan) continue;
    const items = (legacyItemsByRental.get(row.legacyId) || []).map(item => ({ name: item.productName || products.get(item.productLegacyId || "")?.name || "สินค้ารุ่นเดิม", sku: item.sku || products.get(item.productLegacyId || "")?.sku || "", image: products.get(item.productLegacyId || "")?.images?.[0] || "" }));
    rows.push({ id: row.legacyId, legacy: true, name: row.customerName || "", phone: row.phone || "", pickup: false, returnDay: plan.returnDate, start: plan.start, items, customerReturn: null });
  }
  rows.sort((a, b) => a.returnDay.localeCompare(b.returnDay) || a.start.localeCompare(b.start));
  const pageRows = rows.slice(skip, skip + PAGE_SIZE);
  const total = bookingTotal + legacyTotal;
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO RETURN</span><h1>รายการที่ต้องส่งคืน</h1><p>รายการที่ร้านส่งสินค้าให้ลูกค้าแล้ว แต่ยังไม่ได้บันทึกรับคืน แสดงเลขพัสดุขากลับที่ลูกค้าแจ้งมา และยืนยันรับคืนได้จากหน้านี้</p></div></header>
    <ReturnBoard rows={pageRows} today={today} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} filters={{ query, tab }} />
  </main>;
}

async function PageContent({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string; tab?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);
  return <Content page={page} query={params?.q || ""} tab={params?.tab || "all"} />;
}

export default function Page({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string; tab?: string }> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการที่ต้องส่งคืน…</main>}><PageContent searchParams={searchParams} /></Suspense>;
}
