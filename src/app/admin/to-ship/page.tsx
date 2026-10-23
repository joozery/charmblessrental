import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { thaiDay } from "@/lib/finance";
import type { BookingVerification } from "@/lib/identity";
import { database } from "@/lib/mongodb";
import { unitsOf, unitStatusLabels, type Product, type UnitStatus } from "@/lib/products";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";
import { toShipFilter } from "@/lib/to-ship";
import ShipBoard, { type ShipRow } from "./ship-board";
import "./to-ship.css";

export const metadata = { title: "รายการที่ต้องส่ง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = {
  _id: string; name: string; phone: string; address: string; method: string; start: string; end: string; schedule?: ScheduleRecord; paidAt?: Date | null;
  shipping?: { label: string }; verification?: BookingVerification; items: { id: number; name: string; sku: string; image: string; unitSku?: string }[];
};

async function Content() {
  await pageAdmin("shipping");
  const db = await database();
  const bookings = await db.collection<BookingDoc>("bookingRequests").find(toShipFilter, { projection: { _id: 1, name: 1, phone: 1, address: 1, method: 1, start: 1, end: 1, schedule: 1, paidAt: 1, shipping: 1, verification: 1, items: 1 } }).toArray();
  // Where each assigned piece is now, so the list shows whether it is back from the last customer and clean.
  const skus = bookings.flatMap(row => row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku));
  const unitStatus = new Map<string, UnitStatus>();
  if (skus.length) for (const product of await db.collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, units: 1, active: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skus.includes(unit.sku)) unitStatus.set(unit.sku, unit.status);
  const rows: ShipRow[] = bookings.map(row => ({
    id: row._id, name: row.name, phone: row.phone, address: row.address, pickup: row.method === "pickup", methodLabel: row.method === "pickup" ? "รับเองที่ร้าน" : row.shipping?.label || row.method,
    shipDay: row.schedule?.ship || row.start, start: row.start, returnDay: returnDay(row), paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : "",
    identityPending: row.verification?.mode === "identity" && row.verification.status !== "approved",
    items: row.items.map(item => { const status = item.unitSku ? unitStatus.get(item.unitSku) : undefined; return { name: item.name, sku: item.unitSku || item.sku, image: item.image, ready: !item.unitSku || status === "available" || status === undefined, state: status ? unitStatusLabels[status] : "" }; }),
  })).sort((a, b) => a.shipDay.localeCompare(b.shipDay) || a.start.localeCompare(b.start));
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO SHIP</span><h1>รายการที่ต้องส่ง</h1><p>ลูกค้าชำระเงินแล้ว รอร้านจัดส่งหรือส่งมอบที่ร้าน เรียงตามวันที่ต้องส่ง บันทึกเลขพัสดุได้จากหน้านี้ ระบบจะแจ้งลูกค้าทาง LINE ให้</p></div></header>
    <ShipBoard rows={rows} today={thaiDay()} />
  </main>;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการที่ต้องส่ง…</main>}><Content /></Suspense>;
}
