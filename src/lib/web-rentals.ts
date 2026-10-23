import type { Db } from "mongodb";
import { rentalStage } from "./rental-stage";
import { returnDay, type ScheduleRecord } from "./schedule";

// Bookings made on the new website, shaped like the imported rentals (legacyId, shipDate, legacyStatus…) so the
// dashboard and its calendar list both together. Statuses use the imported wording; "เกินกำหนดส่ง" is a piece
// still out after its return day.
export type WebRental = {
  legacyId: string; customerName: string; enteredAt: Date; shipDate: Date; returnDate: Date; legacyStatus: string; total: number | null;
  items: { productName?: string; sku?: string; image?: string }[]; web: true;
};
type BookingDoc = {
  _id: string; name?: string; status: string; payment?: "unpaid" | "paid"; createdAt: Date; start: string; end: string; schedule?: ScheduleRecord;
  estimatedTotal?: number | null; quote?: { rental?: number; deposit?: number; shipping?: number };
  shipment?: object; customerReturn?: object; returned?: object; items: { name?: string; sku?: string; unitSku?: string; image?: string }[];
};

const statusOf = (row: BookingDoc, today: string) => {
  const stage = rentalStage(row);
  if (stage === "shipped" && returnDay(row) < today) return "เกินกำหนดส่ง";
  return { pending: "รอชำระเงิน", paid: "รอจัดส่ง", shipped: "จัดส่งแล้ว", returning: "ลูกค้าส่งคืนแล้ว", returned: "คืนสินค้าแล้ว", cancelled: "ยกเลิก" }[stage];
};

export async function webRentals(db: Db, today: string): Promise<WebRental[]> {
  const rows = await db.collection<BookingDoc>("bookingRequests").find({ status: { $ne: "cancelled" } }, { projection: { _id: 1, name: 1, status: 1, payment: 1, createdAt: 1, start: 1, end: 1, schedule: 1, estimatedTotal: 1, quote: 1, shipment: 1, customerReturn: 1, returned: 1, items: 1 } }).toArray();
  return rows.map(row => ({
    legacyId: row._id, customerName: row.name || "", enteredAt: new Date(row.createdAt),
    shipDate: new Date(`${row.schedule?.ship || row.start}T00:00:00Z`), returnDate: new Date(`${returnDay(row)}T00:00:00Z`),
    legacyStatus: statusOf(row, today),
    total: row.quote ? (row.quote.rental || 0) + (row.quote.deposit || 0) + (row.quote.shipping || 0) : row.estimatedTotal ?? null,
    items: row.items.map(item => ({ productName: item.name, sku: item.unitSku || item.sku, image: item.image || undefined })), web: true,
  }));
}
