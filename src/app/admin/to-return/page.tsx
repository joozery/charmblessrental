import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { thaiDay } from "@/lib/finance";
import { database } from "@/lib/mongodb";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";
import { toReturnFilter } from "@/lib/to-return";
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
  const bookings = await db.collection<BookingDoc>("bookingRequests").find(toReturnFilter, {
    projection: { _id: 1, name: 1, phone: 1, method: 1, start: 1, end: 1, schedule: 1, items: 1, customerReturn: 1 },
  }).toArray();
  const rows: ReturnRow[] = bookings.map(row => ({
    id: row._id, name: row.name, phone: row.phone, pickup: row.method === "pickup",
    returnDay: returnDay(row), start: row.start,
    items: row.items.map(item => ({ name: item.name, sku: item.unitSku || item.sku, image: item.image })),
    customerReturn: row.customerReturn ? { carrier: row.customerReturn.carrier, trackingNumber: row.customerReturn.trackingNumber, at: new Date(row.customerReturn.at).toISOString() } : null,
  })).sort((a, b) => a.returnDay.localeCompare(b.returnDay) || a.start.localeCompare(b.start));
  return <main className="admin-main to-ship-page">
    <header className="to-ship-header"><div><span className="to-ship-eyebrow">TO RETURN</span><h1>รายการที่ต้องส่งคืน</h1><p>รายการที่ร้านส่งสินค้าให้ลูกค้าแล้ว แต่ยังไม่ได้บันทึกรับคืน แสดงเลขพัสดุขากลับที่ลูกค้าแจ้งมา และยืนยันรับคืนได้จากหน้านี้</p></div></header>
    <ReturnBoard rows={rows} today={thaiDay()} />
  </main>;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการที่ต้องส่งคืน…</main>}><Content /></Suspense>;
}
