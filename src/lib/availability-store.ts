import type { Db } from "mongodb";
import { addDays, blockRange, type ScheduleRecord } from "./schedule";
import { lastUseDay, type Extension } from "./extension";
import type { QueueBooking, QueueClash } from "./queue";

type Capacity = { productId: number; date: string; capacity: number };
type BlockingBooking = { _id: string; start: string; end: string; items: { id: number }[]; schedule?: ScheduleRecord };

// A request not yet confirmed (waiting for ID documents, payment or the shop) keeps its queue for this long after it was sent,
// and for as long as its ID documents wait for the shop's review.
export const holdHours = 24;
// A confirmed booking, or a request still on hold, holds its piece from the day the shop ships it until its gap ends (see schedule.ts).
// The same rule as blockingFilter, for a booking already loaded.
export const isBlocking = (row: { status: string; createdAt?: Date | string; verification?: { status: string } | null }) => row.status === "confirmed" || (["new", "contacted"].includes(row.status) && ((!!row.createdAt && new Date(row.createdAt).getTime() > Date.now() - holdHours * 3600000) || row.verification?.status === "submitted"));
export const blockingFilter = (from: string, to: string) => ({ $and: [
  { $or: [{ status: "confirmed" }, { status: { $in: ["new", "contacted"] }, $or: [{ createdAt: { $gt: new Date(Date.now() - holdHours * 3600000) } }, { "verification.status": "submitted" }] }] },
  { $or: [{ "schedule.ship": { $lt: to }, "schedule.ready": { $gt: from } }, { schedule: { $exists: false }, start: { $lt: to }, end: { $gt: from } }] },
] });

export async function getReservationCounts(db: Db, productId: number, from: string, to: string, exceptId?: string) {
  const bookings = await db.collection<BlockingBooking>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": productId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { projection: { _id: 1, start: 1, end: 1, items: 1, schedule: 1 } }).toArray();
  const result = new Map<string, number>();
  for (const booking of bookings) {
    const count = booking.items.filter(item => item.id === productId).length;
    const range = blockRange(booking);
    for (let date = range.from; date < range.to; date = addDays(date, 1)) {
      if (date >= from && date < to) result.set(date, (result.get(date) || 0) + count);
    }
  }
  return result;
}

// Every day in [from, to): a hand-set capacity wins, otherwise the pieces in service (stock) are the capacity.
// `over` counts bookings beyond the pieces that exist (an extension the shop let run into the next rental): a real clash.
export async function getQueue(db: Db, productId: number, from: string, to: string, exceptId?: string) {
  const [capacities, reservations, product] = await Promise.all([
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    getReservationCounts(db, productId, from, to, exceptId),
    db.collection<{ id: number; stock?: number }>("products").findOne({ id: productId }, { projection: { _id: 0, stock: 1 } }),
  ]);
  const set = new Map(capacities.map(day => [day.date, day.capacity]));
  const stock = product?.stock ?? 0, days: { date: string; remaining: number; over: number }[] = [];
  for (let date = from; date < to; date = addDays(date, 1)) { const reserved = reservations.get(date) || 0; days.push({ date, remaining: Math.max(0, (set.get(date) ?? stock) - reserved), over: Math.max(0, reserved - stock) }); }
  return days;
}

type QueueDoc = { _id: string; name?: string; status: string; start: string; end: string; schedule?: ScheduleRecord; items: { id: number }[]; extensions?: Extension[] };
// Every booking or hold that takes this piece out of the queue in [from, to), with the days of each step (admin calendars).
export async function queueBookings(db: Db, productId: number, from: string, to: string): Promise<QueueBooking[]> {
  const rows = await db.collection<QueueDoc>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": productId }, { projection: { _id: 1, name: 1, status: 1, start: 1, end: 1, schedule: 1, extensions: 1 } }).sort({ start: 1 }).toArray();
  return rows.map(row => {
    const range = blockRange(row), end = lastUseDay(row);
    return { id: row._id, name: row.name || "", confirmed: row.status === "confirmed", ship: range.from, start: row.start, end, returnDate: row.schedule?.returnDate ?? addDays(end, 1), ready: range.to };
  });
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
