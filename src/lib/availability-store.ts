import type { Db } from "mongodb";
import { addDays, blockRange, type ScheduleRecord } from "./schedule";
import { lastUseDay, type Extension } from "./extension";
import type { QueueBooking, QueueClash } from "./queue";
import { unitsOf, type Product } from "./products";
import { legacyHolds } from "./legacy-rentals";

type Capacity = { productId: number; date: string; capacity: number };
type BlockingBooking = { _id: string; start: string; end: string; items: { id: number; unitSku?: string; quantity?: number; schedule?: ScheduleRecord }[]; schedule?: ScheduleRecord };

// Who holds a piece. Firmly: a confirmed booking, a paid one, or one whose ID documents wait for the shop's review.
// For a while: a new request has this long to pay from when it got its turn (`holdUntil`); after that it loses the
// queue and the next waiting request (`waitlist`) gets its turn. Requests from before `holdUntil` existed count from creation.
export const holdMinutes = 60;
type HoldState = { status: string; createdAt?: Date | string; payment?: string; holdUntil?: Date | string | null; waitlist?: unknown; verification?: { status: string } | null };
export const isFirm = (row: HoldState) => row.status === "confirmed" || (["new", "contacted"].includes(row.status) && (row.payment === "paid" || row.verification?.status === "submitted"));
export const holdEnds = (row: HoldState) => row.holdUntil ? new Date(row.holdUntil) : row.waitlist || !row.createdAt ? null : new Date(new Date(row.createdAt).getTime() + holdMinutes * 60000);
export const isHeld = (row: HoldState) => ["new", "contacted"].includes(row.status) && !isFirm(row) && (holdEnds(row)?.getTime() ?? 0) > Date.now();
export const isBlocking = (row: HoldState) => isFirm(row) || isHeld(row);
const firmClause = { $or: [{ status: "confirmed" }, { status: { $in: ["new", "contacted"] }, $or: [{ payment: "paid" }, { "verification.status": "submitted" }] }] };
const heldClause = () => ({ status: { $in: ["new", "contacted"] }, $or: [{ holdUntil: { $gt: new Date() } }, { holdUntil: { $exists: false }, waitlist: { $exists: false }, createdAt: { $gt: new Date(Date.now() - holdMinutes * 60000) } }] });
export const blockingFilter = (from: string, to: string, firmOnly = false) => ({ $and: [
  firmOnly ? firmClause : { $or: [firmClause, heldClause()] },
  { $or: [{ "schedule.ship": { $lt: to }, "schedule.ready": { $gt: from } }, { schedule: { $exists: false }, start: { $lt: to }, end: { $gt: from } }] },
] });

export async function getReservationCounts(db: Db, productId: number, from: string, to: string, exceptId?: string, firmOnly = false) {
  const [bookings, product, imported] = await Promise.all([
    db.collection<BlockingBooking>("bookingRequests").find({ ...blockingFilter(from, to, firmOnly), "items.id": productId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { projection: { _id: 1, start: 1, end: 1, items: 1, schedule: 1 } }).toArray(),
    db.collection<Product>("products").findOne({ id: productId }, { projection: { _id: 0, units: 1, sku: 1, active: 1 } }),
    legacyHolds(db, from, to, productId),
  ]);
  const readyUnits = new Set(unitsOf(product || { id: productId, name: "", thai: "", category: "", color: "", dailyRate: null, image: "", images: [], tag: "", description: "" }).filter(unit => unit.status === "available").map(unit => unit.sku));
  const result = new Map<string, number>();
  for (const booking of bookings) {
    const matching = booking.items.filter(item => item.id === productId);
    const active = matching.filter(item => !item.unitSku || !readyUnits.has(item.unitSku));
    const count = active.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    if (!count) continue;
    const range = active[0]?.schedule ? blockRange({ ...booking, schedule: active[0].schedule }) : blockRange(booking);
    for (let date = range.from; date < range.to; date = addDays(date, 1)) {
      if (date >= from && date < to) result.set(date, (result.get(date) || 0) + count);
    }
  }
  // Rentals from the old sheet hold their piece the same way; an unpaid one counts only as a hold.
  for (const hold of imported) {
    if (firmOnly && !hold.firm) continue;
    for (let date = hold.ship < from ? from : hold.ship; date < hold.ready && date < to; date = addDays(date, 1)) result.set(date, (result.get(date) || 0) + 1);
  }
  return result;
}

// Every day in [from, to): a hand-set capacity wins, otherwise the pieces in service (stock) are the capacity.
// `over` counts bookings beyond the pieces that exist (an extension the shop let run into the next rental): a real clash.
export async function getQueue(db: Db, productId: number, from: string, to: string, exceptId?: string) {
  const [capacities, reservations, firm, product] = await Promise.all([
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    getReservationCounts(db, productId, from, to, exceptId),
    getReservationCounts(db, productId, from, to, exceptId, true),
    db.collection<{ id: number; stock?: number }>("products").findOne({ id: productId }, { projection: { _id: 0, stock: 1 } }),
  ]);
  const set = new Map(capacities.map(day => [day.date, day.capacity]));
  const stock = product?.stock ?? 0, days: { date: string; capacity: number; remaining: number; over: number; waitable: boolean }[] = [];
  for (let date = from; date < to; date = addDays(date, 1)) { const reserved = reservations.get(date) || 0, capacity = set.get(date) ?? stock; days.push({ date, capacity, remaining: Math.max(0, capacity - reserved), over: Math.max(0, reserved - stock), waitable: reserved >= capacity && capacity - (firm.get(date) || 0) >= 1 }); }
  return days;
}

type QueueDoc = { _id: string; name?: string; status: string; start: string; end: string; schedule?: ScheduleRecord; items: { id: number; unitSku?: string; quantity?: number; schedule?: ScheduleRecord }[]; extensions?: Extension[] };
// Every booking or hold that takes this piece out of the queue in [from, to), with the days of each step (admin calendars).
export async function queueBookings(db: Db, productId: number, from: string, to: string): Promise<QueueBooking[]> {
  const [rows, imported] = await Promise.all([
    db.collection<QueueDoc>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": productId }, { projection: { _id: 1, name: 1, status: 1, start: 1, end: 1, schedule: 1, extensions: 1, items: 1 } }).sort({ start: 1 }).toArray(),
    legacyHolds(db, from, to, productId),
  ]);
  const web = rows.map(row => {
    const item = row.items.find(entry => entry.id === productId), range = item?.schedule ? blockRange({ ...row, schedule: item.schedule }) : blockRange(row), end = lastUseDay(row);
    const matching = row.items.filter(entry => entry.id === productId), unitSkus = matching.map(entry => entry.unitSku).filter((sku): sku is string => !!sku), unassignedCount = matching.reduce((sum, entry) => sum + Math.max(0, (entry.quantity ?? 1) - (entry.unitSku ? 1 : 0)), 0);
    return { id: row._id, name: row.name || "", confirmed: row.status === "confirmed", ship: range.from, start: row.start, end, returnDate: row.schedule?.returnDate ?? addDays(end, 1), ready: range.to, unitSkus, unassignedCount };
  });
  // One entry per old-sheet rental, with every piece of this product it holds.
  const old = new Map<string, QueueBooking>();
  for (const hold of imported) {
    const seen = old.get(hold.id);
    old.set(hold.id, seen ? { ...seen, unitSkus: [...(seen.unitSkus || []), ...(hold.unitSkus || [])], unassignedCount: (seen.unassignedCount || 0) + (hold.unassignedCount || 0) }
      : { id: hold.id, name: hold.name, confirmed: hold.confirmed, ship: hold.ship, start: hold.start, end: hold.end, returnDate: hold.returnDate, ready: hold.ready, unitSkus: hold.unitSkus, unassignedCount: hold.unassignedCount, href: hold.href });
  }
  return [...web, ...old.values()].sort((a, b) => a.start.localeCompare(b.start));
}

type ClashRow = { _id: string; name?: string; status: string; createdAt?: Date | string; start: string; end: string; schedule?: ScheduleRecord | null; returned?: unknown; verification?: { status: string } | null; items: { id: number; name: string; sku: string }[] };
// Days where more bookings hold a piece than the shop owns, per open booking, with the other bookings on those days.
export async function queueClashes(db: Db, rows: ClashRow[]) {
  const open = rows.filter(row => !row.returned && isBlocking(row));
  const result = new Map<string, QueueClash[]>();
  if (!open.length) return result;
  const from = open.reduce((min, row) => blockRange(row).from < min ? blockRange(row).from : min, blockRange(open[0]).from);
  const to = open.reduce((max, row) => blockRange(row).to > max ? blockRange(row).to : max, blockRange(open[0]).to);
  for (const id of new Set(open.flatMap(row => row.items.map(item => item.id)))) {
    const clashing = (await getQueue(db, id, from, to)).filter(day => day.over > 0).map(day => day.date);
    if (!clashing.length) continue;
    const holders = open.filter(row => row.items.some(item => item.id === id));
    for (const row of holders) {
      const range = blockRange(row), item = row.items.find(entry => entry.id === id)!;
      for (const date of clashing.filter(day => day >= range.from && day < range.to)) {
        const others = holders.filter(other => other._id !== row._id && blockRange(other).from <= date && date < blockRange(other).to).map(other => ({ id: other._id, name: other.name || "" }));
        result.set(row._id, [...(result.get(row._id) || []), { date, item: item.sku || item.name, with: others }]);
      }
    }
  }
  return result;
}
