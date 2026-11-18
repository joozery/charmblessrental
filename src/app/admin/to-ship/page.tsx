import { Suspense } from "react";
import { connection } from "next/server";
import { pageAdmin } from "@/lib/admin-auth";
import { thaiDay } from "@/lib/finance";
import type { BookingVerification } from "@/lib/identity";
import { database } from "@/lib/mongodb";
import { unitsOf, unitStatusLabels, type Product, type UnitStatus } from "@/lib/products";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";
import { toShipFilter } from "@/lib/to-ship";
import ShipBoard, { type ShipCounts, type ShipRow } from "./ship-board";
import "../bookings/bookings.css";
import "./to-ship.css";
import "./to-ship-mobile.css";

const PAGE_SIZE = 20;

export const metadata = { title: "รายการที่ต้องส่ง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = {
  _id: string; name: string; phone: string; address: string; method: string; start: string; end: string; schedule?: ScheduleRecord; paidAt?: Date | null; photos?: { beforeShipment?: { url: string }[] };
  shipping?: { label: string }; verification?: BookingVerification; items: { id: number; variantId?: string; color?: string; size?: string; name: string; sku: string; image: string; note?: string; unitSku?: string; checkedForShipment?: boolean }[];
};
type ReturnCondition = "good" | "damaged" | "missing";
type ReturnedHistory = { start: string; returned?: { at?: Date; condition?: string; items?: { unitSku?: string; condition?: string }[] }; items: { unitSku?: string }[] };

async function Content({ page, query = "", shipDate = "", tab = "all" }: { page: number; query?: string; shipDate?: string; tab?: string }) {
  await pageAdmin("shipping");
  // The order list is live MongoDB data; keep this part out of the static shell.
  await connection();
  const db = await database();
  const tomorrow = new Date(Date.parse(`${thaiDay()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const clauses: Record<string, unknown>[] = [];
  const text = query.trim();
  if (text) clauses.push({ $or: [{ _id: { $regex: text, $options: "i" } }, { name: { $regex: text, $options: "i" } }, { phone: { $regex: text, $options: "i" } }, { address: { $regex: text, $options: "i" } }, { "items.name": { $regex: text, $options: "i" } }, { "items.sku": { $regex: text, $options: "i" } }] });
  if (shipDate) clauses.push({ $or: [{ "schedule.ship": shipDate }, { schedule: { $exists: false }, start: shipDate }] });
  const bucketClause = tab === "late" ? { $or: [{ "schedule.ship": { $lt: thaiDay() } }, { schedule: { $exists: false }, start: { $lt: thaiDay() } }] } : tab === "today" ? { $or: [{ "schedule.ship": thaiDay() }, { schedule: { $exists: false }, start: thaiDay() }] } : tab === "tomorrow" ? { $or: [{ "schedule.ship": tomorrow }, { schedule: { $exists: false }, start: tomorrow }] } : tab === "later" ? { $or: [{ "schedule.ship": { $gt: tomorrow } }, { schedule: { $exists: false }, start: { $gt: tomorrow } }] } : null;
  const baseFilter = clauses.length ? { $and: [toShipFilter, ...clauses] } : toShipFilter;
  const webFilter = bucketClause ? { $and: [baseFilter, bucketClause] } : baseFilter;
  const skip = Math.max(0, page - 1) * PAGE_SIZE;
  const projection = { _id: 1, name: 1, phone: 1, address: 1, method: 1, start: 1, end: 1, schedule: 1, paidAt: 1, shipping: 1, verification: 1, items: 1, photos: 1 };
  const bucketFilters = {
    late: { $or: [{ "schedule.ship": { $lt: thaiDay() } }, { schedule: { $exists: false }, start: { $lt: thaiDay() } }] },
    today: { $or: [{ "schedule.ship": thaiDay() }, { schedule: { $exists: false }, start: thaiDay() }] },
    tomorrow: { $or: [{ "schedule.ship": tomorrow }, { schedule: { $exists: false }, start: tomorrow }] },
    later: { $or: [{ "schedule.ship": { $gt: tomorrow } }, { schedule: { $exists: false }, start: { $gt: tomorrow } }] },
  };
  const [bookings, bookingTotal, allCount, lateCount, todayCount, tomorrowCount, laterCount] = await Promise.all([
    db.collection<BookingDoc>("bookingRequests").find(webFilter, { projection }).sort({ "schedule.ship": 1, start: 1, _id: 1 }).limit(skip + PAGE_SIZE).toArray(),
    db.collection<BookingDoc>("bookingRequests").countDocuments(webFilter),
    db.collection<BookingDoc>("bookingRequests").countDocuments(baseFilter),
    db.collection<BookingDoc>("bookingRequests").countDocuments({ $and: [baseFilter, bucketFilters.late] }),
    db.collection<BookingDoc>("bookingRequests").countDocuments({ $and: [baseFilter, bucketFilters.today] }),
    db.collection<BookingDoc>("bookingRequests").countDocuments({ $and: [baseFilter, bucketFilters.tomorrow] }),
    db.collection<BookingDoc>("bookingRequests").countDocuments({ $and: [baseFilter, bucketFilters.later] }),
  ]);
  // Where each assigned piece is now, so the list shows whether it is back from the last customer and clean.
  const skus = [...new Set(bookings.flatMap(row => row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku)))];
  const skuSet = new Set(skus);
  const unitStatus = new Map<string, UnitStatus>();
  if (skus.length) for (const product of await db.collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, units: 1, active: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skuSet.has(unit.sku)) unitStatus.set(unit.sku, unit.status);
  const historyBySku = new Map<string, ReturnedHistory[]>();
  if (skus.length) {
    const histories = await db.collection<ReturnedHistory>("bookingRequests").find({ returned: { $exists: true }, "items.unitSku": { $in: skus } }, { projection: { _id: 0, start: 1, items: 1, returned: 1 } }).sort({ "returned.at": -1 }).toArray();
    for (const history of histories) for (const item of history.items) if (item.unitSku && skuSet.has(item.unitSku)) historyBySku.set(item.unitSku, [...(historyBySku.get(item.unitSku) || []), history]);
  }
  const conditionFor = (history: ReturnedHistory, sku: string): ReturnCondition | undefined => {
    const condition = history.returned?.items?.find(item => item.unitSku === sku)?.condition || history.returned?.condition;
    return condition === "good" || condition === "damaged" || condition === "missing" ? condition : undefined;
  };
  const rows: ShipRow[] = bookings.map(row => ({
    id: row._id, name: row.name, phone: row.phone, address: row.address, pickup: row.method === "pickup", methodLabel: row.method === "pickup" ? "รับเองที่ร้าน" : row.shipping?.label || row.method,
    shipDay: row.schedule?.ship || row.start, start: row.start, returnDay: returnDay(row), paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : "",
    identityPending: row.verification?.mode === "identity" && row.verification.status !== "approved", beforeShipmentPhotos: row.photos?.beforeShipment?.map(photo => photo.url) || [],
    items: row.items.map(item => { const status = item.unitSku ? unitStatus.get(item.unitSku) : undefined; const cutoff = new Date(`${row.start}T23:59:59.999Z`).getTime(); const previous = item.unitSku ? (historyBySku.get(item.unitSku) || []).find(history => new Date(history.returned?.at || 0).getTime() <= cutoff) : undefined; return { id: item.id, name: `${item.name}${item.color || item.size ? ` · ${item.color || ""}${item.color && item.size ? " / " : ""}${item.size || ""}` : ""}`, sku: item.unitSku || item.sku, image: item.image, ready: !item.unitSku || status === "available" || status === undefined, state: status ? unitStatusLabels[status] : "", previousCondition: status === "available" ? "good" : previous && item.unitSku ? conditionFor(previous, item.unitSku) || "good" : "good", checkedForShipment: !!item.checkedForShipment }; }),
  }));
  const rowsWithNotes: ShipRow[] = rows.map((shipRow, rowIndex) => ({ ...shipRow, items: shipRow.items.map((item, itemIndex) => { const note = bookings[rowIndex]?.items[itemIndex]?.note?.trim(); return note ? { ...item, name: `${item.name} · หมายเหตุ: ${note}` } : item; }) }));
  rows.splice(0, rows.length, ...rowsWithNotes);
  rows.sort((a, b) => a.shipDay.localeCompare(b.shipDay) || a.start.localeCompare(b.start));
  const total = bookingTotal;
  const pageRows = rows.slice(skip, skip + PAGE_SIZE);
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO SHIP</span><h1>รายการที่ต้องส่ง</h1><p>ลูกค้าชำระเงินแล้ว รอร้านจัดส่งหรือส่งมอบที่ร้าน เรียงตามวันที่ต้องส่ง บันทึกเลขพัสดุได้จากหน้านี้ ระบบจะแจ้งลูกค้าทาง LINE ให้</p></div></header>
    <ShipBoard rows={pageRows} today={thaiDay()} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} counts={{ all: allCount, late: lateCount, today: todayCount, tomorrow: tomorrowCount, later: laterCount }} filters={{ query, shipDate, tab }} />
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
