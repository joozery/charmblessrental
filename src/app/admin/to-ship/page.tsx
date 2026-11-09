import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { thaiDay } from "@/lib/finance";
import type { BookingVerification } from "@/lib/identity";
import { database } from "@/lib/mongodb";
import { unitsOf, unitStatusLabels, type Product, type UnitStatus } from "@/lib/products";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";
import { legacyItems, legacyPlan, legacyRentals, legacyShipFrom } from "@/lib/legacy-rentals";
import { productsByLegacyIds } from "@/lib/product-store";
import { legacyToShipFilter, toShipFilter } from "@/lib/to-ship";
import ShipBoard, { type ShipRow } from "./ship-board";
import "./to-ship.css";
import "./to-ship-mobile.css";

const PAGE_SIZE = 20;

export const metadata = { title: "รายการที่ต้องส่ง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = {
  _id: string; name: string; phone: string; address: string; method: string; start: string; end: string; schedule?: ScheduleRecord; paidAt?: Date | null;
  shipping?: { label: string }; verification?: BookingVerification; items: { id: number; name: string; sku: string; image: string; unitSku?: string }[];
};

async function Content({ page, query = "", shipDate = "", tab = "all" }: { page: number; query?: string; shipDate?: string; tab?: string }) {
  await pageAdmin("shipping");
  const db = await database();
  const tomorrow = new Date(Date.parse(`${thaiDay()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString();
  const clauses: Record<string, unknown>[] = [];
  const text = query.trim();
  if (text) clauses.push({ $or: [{ _id: { $regex: text, $options: "i" } }, { name: { $regex: text, $options: "i" } }, { phone: { $regex: text, $options: "i" } }, { address: { $regex: text, $options: "i" } }, { "items.name": { $regex: text, $options: "i" } }, { "items.sku": { $regex: text, $options: "i" } }] });
  if (shipDate) clauses.push({ $or: [{ "schedule.ship": shipDate }, { schedule: { $exists: false }, start: shipDate }] });
  const bucketClause = tab === "late" ? { $or: [{ "schedule.ship": { $lt: thaiDay() } }, { schedule: { $exists: false }, start: { $lt: thaiDay() } }] } : tab === "today" ? { $or: [{ "schedule.ship": thaiDay() }, { schedule: { $exists: false }, start: thaiDay() }] } : tab === "tomorrow" ? { $or: [{ "schedule.ship": tomorrow }, { schedule: { $exists: false }, start: tomorrow }] } : tab === "later" ? { $or: [{ "schedule.ship": { $gt: tomorrow } }, { schedule: { $exists: false }, start: { $gt: tomorrow } }] } : null;
  if (bucketClause) clauses.push(bucketClause);
  const webFilter = clauses.length ? { $and: [toShipFilter, ...clauses] } : toShipFilter;
  const legacyClauses: Record<string, unknown>[] = [];
  if (text) legacyClauses.push({ $or: [{ legacyId: { $regex: text, $options: "i" } }, { customerName: { $regex: text, $options: "i" } }, { phone: { $regex: text, $options: "i" } }, { address: { $regex: text, $options: "i" } }] });
  if (shipDate) legacyClauses.push({ shipDate: { $gte: new Date(`${shipDate}T00:00:00.000Z`), $lt: new Date(nextDay(shipDate)) } });
  if (tab === "late") legacyClauses.push({ shipDate: { $lt: new Date(`${thaiDay()}T00:00:00.000Z`) } });
  if (tab === "today") legacyClauses.push({ shipDate: { $gte: new Date(`${thaiDay()}T00:00:00.000Z`), $lt: new Date(nextDay(thaiDay())) } });
  if (tab === "tomorrow") legacyClauses.push({ shipDate: { $gte: new Date(`${tomorrow}T00:00:00.000Z`), $lt: new Date(nextDay(tomorrow)) } });
  if (tab === "later") legacyClauses.push({ shipDate: { $gte: new Date(nextDay(tomorrow)) } });
  const legacyFilter = legacyClauses.length ? { $and: [legacyToShipFilter(legacyShipFrom), ...legacyClauses] } : legacyToShipFilter(legacyShipFrom);
  const skip = Math.max(0, page - 1) * PAGE_SIZE;
  const projection = { _id: 1, name: 1, phone: 1, address: 1, method: 1, start: 1, end: 1, schedule: 1, paidAt: 1, shipping: 1, verification: 1, items: 1 };
  const legacyProjection = { _id: 0, legacyId: 1, customerName: 1, phone: 1, address: 1, shipDate: 1, returnDate: 1, days: 1, paidAt: 1, carrier: 1 };
  const [bookings, imported, bookingTotal, importedTotal] = await Promise.all([
    db.collection<BookingDoc>("bookingRequests").find(webFilter, { projection }).sort({ "schedule.ship": 1, start: 1, _id: 1 }).limit(skip + PAGE_SIZE).toArray(),
    legacyRentals(db).find(legacyFilter, { projection: legacyProjection }).sort({ shipDate: 1, _id: 1 }).limit(skip + PAGE_SIZE).toArray(),
    db.collection<BookingDoc>("bookingRequests").countDocuments(webFilter),
    legacyRentals(db).countDocuments(legacyFilter),
  ]);
  const importedItems = imported.length ? await legacyItems(db).find({ rentalId: { $in: imported.map(row => row.legacyId) } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const importedItemsByRental = new Map<string, typeof importedItems>();
  for (const item of importedItems) importedItemsByRental.set(item.rentalId, [...(importedItemsByRental.get(item.rentalId) || []), item]);
  const importedProducts = await productsByLegacyIds(db, [...new Set(importedItems.map(item => item.productLegacyId).filter((id): id is string => !!id))]);
  // Where each assigned piece is now, so the list shows whether it is back from the last customer and clean.
  const skus = [...new Set([...bookings.flatMap(row => row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku)), ...importedItems.map(item => item.sku).filter((sku): sku is string => !!sku)])];
  const skuSet = new Set(skus);
  const unitStatus = new Map<string, UnitStatus>();
  if (skus.length) for (const product of await db.collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, units: 1, active: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skuSet.has(unit.sku)) unitStatus.set(unit.sku, unit.status);
  const rows: ShipRow[] = bookings.map(row => ({
    id: row._id, name: row.name, phone: row.phone, address: row.address, pickup: row.method === "pickup", methodLabel: row.method === "pickup" ? "รับเองที่ร้าน" : row.shipping?.label || row.method,
    shipDay: row.schedule?.ship || row.start, start: row.start, returnDay: returnDay(row), paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : "",
    identityPending: row.verification?.mode === "identity" && row.verification.status !== "approved",
    items: row.items.map(item => { const status = item.unitSku ? unitStatus.get(item.unitSku) : undefined; return { name: item.name, sku: item.unitSku || item.sku, image: item.image, ready: !item.unitSku || status === "available" || status === undefined, state: status ? unitStatusLabels[status] : "" }; }),
  }));
  // Old-sheet rentals: the sheet has no delivery method, so they are shipped by parcel like most of them were.
  for (const row of imported) {
    const plan = legacyPlan(row, 0);
    if (!plan) continue;
    rows.push({
      id: row.legacyId, legacy: true, name: row.customerName || "", phone: row.phone || "", address: row.address || "", pickup: false, methodLabel: row.carrier || "รายการจากระบบเดิม",
      shipDay: plan.ship, start: plan.start, returnDay: plan.returnDate, paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : "", identityPending: false,
      items: (importedItemsByRental.get(row.legacyId) || []).map(item => { const product = importedProducts.get(item.productLegacyId || ""), status = item.sku ? unitStatus.get(item.sku) : undefined; return { name: item.productName || product?.name || "สินค้าเดิม", sku: item.sku || "", image: product?.imageStatus === "missing-source" ? "" : product?.images?.[0] || "", ready: !status || status === "available", state: status ? unitStatusLabels[status] : "" }; }),
    });
  }
  rows.sort((a, b) => a.shipDay.localeCompare(b.shipDay) || a.start.localeCompare(b.start));
  const total = bookingTotal + importedTotal;
  const pageRows = rows.slice(skip, skip + PAGE_SIZE);
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO SHIP</span><h1>รายการที่ต้องส่ง</h1><p>ลูกค้าชำระเงินแล้ว รอร้านจัดส่งหรือส่งมอบที่ร้าน เรียงตามวันที่ต้องส่ง บันทึกเลขพัสดุได้จากหน้านี้ ระบบจะแจ้งลูกค้าทาง LINE ให้</p></div></header>
    <ShipBoard rows={pageRows} today={thaiDay()} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} filters={{ query, shipDate, tab }} />
  </main>;
}

async function PageContent({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string; date?: string; tab?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);
  return <Content page={page} query={params?.q || ""} shipDate={params?.date || ""} tab={params?.tab || "all"} />;
}

export default function Page({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string; date?: string; tab?: string }> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการที่ต้องส่ง…</main>}><PageContent searchParams={searchParams} /></Suspense>;
}
