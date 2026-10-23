import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { thaiDay } from "@/lib/finance";
import { database } from "@/lib/mongodb";
import { prepStatuses, unitsOf, type Product } from "@/lib/products";
import { addDays, returnDay, type ScheduleRecord } from "@/lib/schedule";
import PreparationBoard, { type PrepPiece } from "./preparation-board";
import "./preparation.css";

export const metadata = { title: "เตรียมสินค้า | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = { _id: string; name: string; start: string; end: string; schedule?: ScheduleRecord; status: string; items: { id: number; unitSku?: string }[]; shipment?: object; returned?: { at: Date; condition: string; note: string } };

async function Content() {
  await pageAdmin("shipping");
  const db = await database();
  const products = await db.collection<Product>("products").find({ "units.status": { $in: [...prepStatuses, "rented"] } }, { projection: { _id: 0, id: 1, name: 1, sku: 1, images: 1, units: 1, cost: 1, active: 1, legacyId: 1 } }).toArray();
  const pieces = products.flatMap(product => unitsOf(product).filter(unit => prepStatuses.includes(unit.status) || unit.status === "rented").map(unit => ({ product, unit })));
  const skus = pieces.map(piece => piece.unit.sku);
  const bookings = await db.collection<BookingDoc>("bookingRequests").find({ "items.unitSku": { $in: skus }, status: { $ne: "cancelled" } }, { projection: { _id: 1, name: 1, start: 1, end: 1, schedule: 1, status: 1, items: 1, shipment: 1, returned: 1 } }).toArray();
  const today = thaiDay();
  const rows: PrepPiece[] = pieces.map(({ product, unit }) => {
    const mine = bookings.filter(booking => booking.items.some(item => item.unitSku === unit.sku));
    const last = mine.filter(booking => booking.returned).sort((a, b) => +new Date(b.returned!.at) - +new Date(a.returned!.at))[0];
    const out = mine.find(booking => booking.shipment && !booking.returned);
    const next = mine.filter(booking => booking.status === "confirmed" && !booking.shipment && booking.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
    return {
      sku: unit.sku, status: unit.status, note: unit.note, productName: product.name, image: product.images?.[0] || "",
      // The gap after the last rental is the time set aside to clean and check the piece before it may ship again.
      lastReturn: last ? { bookingId: last._id, at: new Date(last.returned!.at).toISOString(), condition: last.returned!.condition, note: last.returned!.note, gapEnd: last.schedule ? addDays(last.schedule.ready, -1) : "" } : null,
      out: out ? { bookingId: out._id, name: out.name, end: returnDay(out) } : null,
      next: next ? { bookingId: next._id, name: next.name, start: next.schedule?.ship ?? next.start } : null,
    };
  });
  return <PreparationBoard initial={rows} today={today} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดรายการเตรียมสินค้า…</main>}><Content /></Suspense>;
}
