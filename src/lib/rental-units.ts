import type { Db } from "mongodb";
import { inService, unitsOf, type Product, type UnitStatus } from "./products";
import { blockRange, type ScheduleRecord } from "./schedule";

type Item = { id: number; unitSku?: string };
type BookingLike = { _id: string; start: string; end: string; items: Item[]; schedule?: ScheduleRecord | null };
export type UnitChoice = { sku: string; status: UnitStatus };

// Pieces each booked product can be fulfilled with, keyed by product id.
export async function unitChoices(db: Db, productIds: number[]) {
  const rows = await db.collection<Product>("products").find({ id: { $in: [...new Set(productIds)] } }, { projection: { _id: 0, id: 1, sku: 1, cost: 1, active: 1, legacyId: 1, units: 1 } }).toArray();
  return new Map(rows.map(product => [product.id, unitsOf(product).filter(unit => inService(unit.status)).map(unit => ({ sku: unit.sku, status: unit.status }))]));
}

// Pieces promised to other open bookings: those overlapping these dates cannot be used, the rest are only avoided.
async function reservedUnits(db: Db, booking: BookingLike) {
  const rows = await db.collection<BookingLike>("bookingRequests").find({ _id: { $ne: booking._id }, status: "confirmed", returned: { $exists: false }, "items.unitSku": { $exists: true } }, { projection: { start: 1, end: 1, items: 1, schedule: 1 } }).toArray();
  const skus = (list: BookingLike[]) => new Set(list.flatMap(row => row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku)));
  const mine = blockRange(booking);
  return { busy: skus(rows.filter(row => { const range = blockRange(row); return range.from < mine.to && range.to > mine.from; })), promised: skus(rows) };
}

// Reserves a piece for each item that has none yet, preferring pieces that are ready now.
export async function assignUnits(db: Db, booking: BookingLike) {
  if (booking.items.every(item => item.unitSku)) return booking.items;
  const [choices, { busy, promised }] = await Promise.all([unitChoices(db, booking.items.map(item => item.id)), reservedUnits(db, booking)]);
  const taken = new Set(booking.items.map(item => item.unitSku).filter(Boolean));
  const items = booking.items.map(item => {
    if (item.unitSku) return item;
    const free = (choices.get(item.id) || []).filter(unit => !busy.has(unit.sku) && !taken.has(unit.sku));
    const unit = free.find(choice => choice.status === "available" && !promised.has(choice.sku)) || free.find(choice => !promised.has(choice.sku)) || free.find(choice => choice.status === "available") || free[0];
    if (!unit) return item;
    taken.add(unit.sku);
    return { ...item, unitSku: unit.sku };
  });
  return items;
}

// The pieces an admin picked for each item must belong to that item's product and still be in service.
export async function validUnitPicks(db: Db, booking: BookingLike, picks: unknown) {
  if (!Array.isArray(picks) || picks.length !== booking.items.length || picks.some(sku => typeof sku !== "string" || sku.length > 100)) return null;
  const choices = await unitChoices(db, booking.items.map(item => item.id));
  const chosen = (picks as string[]).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) return null;
  return (picks as string[]).every((sku, index) => !sku || (choices.get(booking.items[index].id) || []).some(unit => unit.sku === sku)) ? picks as string[] : null;
}
