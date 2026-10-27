import type { Db } from "mongodb";
import { normalizePhone } from "./identity";
import type { QueueBooking } from "./queue";
import { addDays } from "./schedule";
import { getStoreSettings } from "./store-settings";

// Rentals imported from the old sheet (`rentals` + one `rentalItems` row per piece). They keep holding their pieces
// in the queue until the shop marks them returned or cancelled. The sheet's dates follow the shop's chart, as in
// planRental(): returnDate is the day after the last day of use, and the piece is free again `gap` days after that.
export const legacyOpen = ["รอชำระเงิน", "รอจัดส่ง", "จัดส่งแล้ว"];
// Rentals due to ship before this day were sent from the old sheet; later ones go out from the to-ship page.
export const legacyShipFrom = "2026-10-27";
export type LegacyRental = {
  legacyId: string; customerName?: string; phone?: string; phoneKey?: string; address?: string; legacyStatus?: string; importedStatus?: string;
  shipDate?: Date | null; returnDate?: Date | null; days?: number | null; paidAt?: Date | null; carrier?: string;
  shipment?: { carrier: string; trackingNumber: string; shippedAt: Date; by: string; byName: string };
  returned?: { at: Date; condition: string; note: string; by: string; byName: string };
  cancelled?: { at: Date; reason: string; by: string; byName: string };
  updatedAt?: Date; updatedBy?: string;
};
export type LegacyItem = { rentalId: string; productId?: number; productLegacyId?: string; sku?: string; productName?: string };
export type LegacyHold = QueueBooking & { productId: number; unitSku: string; firm: boolean };

const day = (value: Date) => value.toISOString().slice(0, 10);
const midnight = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const legacyRentals = (db: Db) => db.collection<LegacyRental>("rentals");
export const legacyItems = (db: Db) => db.collection<LegacyItem>("rentalItems");
export const legacyHref = (id: string) => `/admin/rentals?q=${encodeURIComponent(id)}`;

export function legacyPlan(rental: Pick<LegacyRental, "shipDate" | "returnDate" | "days">, gap: number) {
  if (!rental.shipDate || !rental.returnDate) return null;
  const ship = day(new Date(rental.shipDate)), returnDate = day(new Date(rental.returnDate)), end = addDays(returnDate, -1);
  const start = rental.days && rental.days > 0 ? addDays(returnDate, -rental.days) : addDays(ship, 1);
  return { ship, start: start < ship ? ship : start, end, returnDate, ready: addDays(returnDate, gap + 1) };
}

// Every open imported rental piece that is out of the queue somewhere in [from, to), optionally for one product.
export async function legacyHolds(db: Db, from: string, to: string, productId?: number): Promise<LegacyHold[]> {
  // The gap is at most 14 days (validSchedule), so a rental returned earlier than this is free again before `from`.
  const rentals = await legacyRentals(db).find({ legacyStatus: { $in: legacyOpen }, shipDate: { $lt: midnight(to) }, returnDate: { $gte: midnight(addDays(from, -16)) } }, { projection: { _id: 0, legacyId: 1, customerName: 1, legacyStatus: 1, shipDate: 1, returnDate: 1, days: 1 } }).toArray();
  if (!rentals.length) return [];
  const found = await legacyItems(db).find({ rentalId: { $in: rentals.map(row => row.legacyId) }, ...(productId ? { productId } : { productId: { $exists: true } }) }, { projection: { _id: 0, rentalId: 1, productId: 1, sku: 1 } }).toArray();
  const items = found.flatMap(item => typeof item.productId === "number" ? [{ ...item, productId: item.productId }] : []);
  if (!items.length) return [];
  const [settings, products] = await Promise.all([
    getStoreSettings(),
    db.collection<{ id: number; gapDays?: number | null }>("products").find({ id: { $in: [...new Set(items.map(item => item.productId))] } }, { projection: { _id: 0, id: 1, gapDays: 1 } }).toArray(),
  ]);
  // The sheet does not say how a piece comes back, so it rests as long as a parcel return unless the product sets its own gap.
  const gapOf = new Map(products.map(product => [product.id, product.gapDays ?? settings.schedule.gap.parcel]));
  const byId = new Map(rentals.map(row => [row.legacyId, row]));
  const holds: LegacyHold[] = [];
  for (const item of items) {
    const rental = byId.get(item.rentalId)!, plan = legacyPlan(rental, gapOf.get(item.productId) ?? settings.schedule.gap.parcel);
    if (!plan || plan.ship >= to || plan.ready <= from) continue;
    const firm = rental.legacyStatus !== "รอชำระเงิน";
    holds.push({ id: rental.legacyId, name: rental.customerName || "", confirmed: firm, firm, ...plan, productId: item.productId, unitSku: item.sku || "", unitSkus: item.sku ? [item.sku] : [], unassignedCount: item.sku ? 0 : 1, href: legacyHref(rental.legacyId) });
  }
  return holds;
}

// Times a customer rented through the old sheet, matched by phone number (`phoneKey` is normalizePhone(phone)).
export async function legacyRentalCount(db: Db, phone?: string) {
  const key = phone ? normalizePhone(phone) : "";
  return key.length >= 9 ? legacyRentals(db).countDocuments({ phoneKey: key, legacyStatus: { $ne: "ยกเลิก" } }) : 0;
}
