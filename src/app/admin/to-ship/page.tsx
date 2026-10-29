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

export const metadata = { title: "รายการที่ต้องส่ง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = {
  _id: string; name: string; phone: string; address: string; method: string; start: string; end: string; schedule?: ScheduleRecord; paidAt?: Date | null;
  shipping?: { label: string }; verification?: BookingVerification; items: { id: number; name: string; sku: string; image: string; unitSku?: string }[];
};

async function Content() {
  await pageAdmin("shipping");
  const db = await database();
  const [bookings, imported] = await Promise.all([db.collection<BookingDoc>("bookingRequests").find(toShipFilter, { projection: { _id: 1, name: 1, phone: 1, address: 1, method: 1, start: 1, end: 1, schedule: 1, paidAt: 1, shipping: 1, verification: 1, items: 1 } }).toArray(), legacyRentals(db).find(legacyToShipFilter(legacyShipFrom), { projection: { _id: 0, legacyId: 1, customerName: 1, phone: 1, address: 1, shipDate: 1, returnDate: 1, days: 1, paidAt: 1, carrier: 1 } }).toArray()]);
  const importedItems = imported.length ? await legacyItems(db).find({ rentalId: { $in: imported.map(row => row.legacyId) } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const importedProducts = await productsByLegacyIds(db, [...new Set(importedItems.map(item => item.productLegacyId).filter((id): id is string => !!id))]);
  // Where each assigned piece is now, so the list shows whether it is back from the last customer and clean.
  const skus = [...bookings.flatMap(row => row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku)), ...importedItems.map(item => item.sku).filter((sku): sku is string => !!sku)];
  const unitStatus = new Map<string, UnitStatus>();
  if (skus.length) for (const product of await db.collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, units: 1, active: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skus.includes(unit.sku)) unitStatus.set(unit.sku, unit.status);
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
      items: importedItems.filter(item => item.rentalId === row.legacyId).map(item => { const product = importedProducts.get(item.productLegacyId || ""), status = item.sku ? unitStatus.get(item.sku) : undefined; return { name: item.productName || product?.name || "สินค้าเดิม", sku: item.sku || "", image: product?.imageStatus === "missing-source" ? "" : product?.images?.[0] || "", ready: !status || status === "available", state: status ? unitStatusLabels[status] : "" }; }),
    });
  }
  rows.sort((a, b) => a.shipDay.localeCompare(b.shipDay) || a.start.localeCompare(b.start));
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO SHIP</span><h1>รายการที่ต้องส่ง</h1><p>ลูกค้าชำระเงินแล้ว รอร้านจัดส่งหรือส่งมอบที่ร้าน เรียงตามวันที่ต้องส่ง บันทึกเลขพัสดุได้จากหน้านี้ ระบบจะแจ้งลูกค้าทาง LINE ให้</p></div></header>
    <ShipBoard rows={rows} today={thaiDay()} />
  </main>;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการที่ต้องส่ง…</main>}><Content /></Suspense>;
}
