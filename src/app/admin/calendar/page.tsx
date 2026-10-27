import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { blockingFilter } from "@/lib/availability-store";
import { lastUseDay, type Extension } from "@/lib/extension";
import { thaiDay } from "@/lib/finance";
import { legacyHolds } from "@/lib/legacy-rentals";
import { database } from "@/lib/mongodb";
import type { QueueBooking } from "@/lib/queue";
import { addDays, blockRange, type ScheduleRecord } from "@/lib/schedule";
import AllCalendar, { type CalendarProduct } from "./all-calendar";
import "./calendar.css";

export const metadata = { title: "ปฏิทินทุกชุด | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = { _id: string; name?: string; status: string; start: string; end: string; schedule?: ScheduleRecord; extensions?: Extension[]; items: { id: number; name: string; sku: string }[] };
type ProductDoc = { id: number; name: string; sku?: string; stock?: number; images?: string[] };

// Every piece's month on one screen: who has it, when it ships, is used, comes back and rests before the next rental.
async function Content({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  await pageAdmin("bookings");
  const { month: asked } = await searchParams;
  const month = typeof asked === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : thaiDay().slice(0, 7);
  const from = `${month}-01`, next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const to = next.toISOString().slice(0, 10), db = await database();
  const [rows, products, imported] = await Promise.all([
    db.collection<BookingDoc>("bookingRequests").find(blockingFilter(from, to), { projection: { _id: 1, name: 1, status: 1, start: 1, end: 1, schedule: 1, extensions: 1, items: 1 } }).toArray(),
    db.collection<ProductDoc>("products").find({ active: { $ne: false } }, { projection: { _id: 0, id: 1, name: 1, sku: 1, stock: 1, images: 1 } }).sort({ sku: 1 }).toArray(),
    legacyHolds(db, from, to),
  ]);
  const byProduct = new Map<number, QueueBooking[]>();
  for (const row of rows) {
    const range = blockRange(row), end = lastUseDay(row);
    const booking: QueueBooking = { id: row._id, name: row.name || "", confirmed: row.status === "confirmed", ship: range.from, start: row.start, end, returnDate: row.schedule?.returnDate ?? addDays(end, 1), ready: range.to };
    for (const id of new Set(row.items.map(item => item.id))) byProduct.set(id, [...(byProduct.get(id) || []), booking]);
  }
  // Rentals from the old sheet, once per product however many of its pieces they hold.
  for (const hold of imported) {
    const list = byProduct.get(hold.productId) || [];
    if (!list.some(booking => booking.id === hold.id)) byProduct.set(hold.productId, [...list, { id: hold.id, name: hold.name, confirmed: hold.confirmed, ship: hold.ship, start: hold.start, end: hold.end, returnDate: hold.returnDate, ready: hold.ready, href: hold.href }]);
  }
  const list: CalendarProduct[] = products.map(product => ({ id: product.id, name: product.name, sku: product.sku || "", stock: product.stock ?? 0, image: product.images?.[0] || "", bookings: byProduct.get(product.id) || [] }));
  return <AllCalendar month={month} today={thaiDay()} products={list} />;
}
export default function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดปฏิทิน…</main>}><Content searchParams={searchParams} /></Suspense>;
}
