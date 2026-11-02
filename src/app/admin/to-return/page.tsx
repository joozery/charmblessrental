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

export const metadata = { title: "รอส่งคืน | Charm Bless", robots: { index: false, follow: false } };

type BookingDoc = {
  _id: string; name: string; phone: string; method: string; start: string; end: string;
  schedule?: ScheduleRecord; items: { name: string; sku: string; image: string; unitSku?: string }[];
  customerReturn?: { carrier: string; trackingNumber: string; at: Date };
};

async function Content() {
  await pageAdmin("shipping");
  const db = await database();
  const [bookings, legacy] = await Promise.all([db.collection<BookingDoc>("bookingRequests").find(toReturnFilter, {
    projection: { _id: 1, name: 1, phone: 1, method: 1, start: 1, end: 1, schedule: 1, items: 1, customerReturn: 1 },
  }).toArray(), legacyRentals(db).find({ shipment: { $exists: true }, returned: { $exists: false }, cancelled: { $exists: false }, legacyStatus: { $in: ["จัดส่งแล้ว", "เกินกำหนดส่ง"] } }, {
    projection: { _id: 0, legacyId: 1, customerName: 1, phone: 1, shipDate: 1, returnDate: 1, days: 1, shipment: 1 },
  }).toArray()]);
  const rows: ReturnRow[] = bookings.map(row => ({
    id: row._id, name: row.name, phone: row.phone, pickup: row.method === "pickup",
    returnDay: returnDay(row), start: row.start,
    items: row.items.map(item => ({ name: item.name, sku: item.unitSku || item.sku, image: item.image })),
    customerReturn: row.customerReturn ? { carrier: row.customerReturn.carrier, trackingNumber: row.customerReturn.trackingNumber, at: new Date(row.customerReturn.at).toISOString() } : null,
  })).sort((a, b) => a.returnDay.localeCompare(b.returnDay) || a.start.localeCompare(b.start));
  const legacyItemsRows = legacy.length ? await legacyItems(db).find({ rentalId: { $in: legacy.map(row => row.legacyId) } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const products = await productsByLegacyIds(db, [...new Set(legacyItemsRows.map(item => item.productLegacyId).filter((id): id is string => !!id))]);
  for (const row of legacy) {
    const plan = legacyPlan(row, 0);
    if (!plan) continue;
    const items = legacyItemsRows.filter(item => item.rentalId === row.legacyId).map(item => ({ name: item.productName || products.get(item.productLegacyId || "")?.name || "สินค้ารุ่นเดิม", sku: item.sku || products.get(item.productLegacyId || "")?.sku || "", image: products.get(item.productLegacyId || "")?.images?.[0] || "" }));
    rows.push({ id: row.legacyId, legacy: true, name: row.customerName || "", phone: row.phone || "", pickup: false, returnDay: plan.returnDate, start: plan.start, items, customerReturn: null });
  }
  rows.sort((a, b) => a.returnDay.localeCompare(b.returnDay) || a.start.localeCompare(b.start));
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO RETURN</span><h1>รายการที่ต้องส่งคืน</h1><p>รายการที่ร้านส่งสินค้าให้ลูกค้าแล้ว แต่ยังไม่ได้บันทึกรับคืน แสดงเลขพัสดุขากลับที่ลูกค้าแจ้งมา และยืนยันรับคืนได้จากหน้านี้</p></div></header>
    <ReturnBoard rows={rows} today={thaiDay()} />
  </main>;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการที่ต้องส่งคืน…</main>}><Content /></Suspense>;
}
