import type { Db } from "mongodb";
import { addDays, blockRange, type ScheduleRecord } from "./schedule";

type Capacity = { productId: number; date: string; capacity: number };
type ConfirmedBooking = { _id: string; start: string; end: string; items: { id: number }[]; schedule?: ScheduleRecord };

// A confirmed booking holds its piece from the day the shop ships it until its gap ends (see schedule.ts).
export const blockingFilter = (from: string, to: string) => ({ status: "confirmed", $or: [{ "schedule.ship": { $lt: to }, "schedule.ready": { $gt: from } }, { schedule: { $exists: false }, start: { $lt: to }, end: { $gt: from } }] });

export async function getReservationCounts(db: Db, productId: number, from: string, to: string, exceptId?: string) {
  const bookings = await db.collection<ConfirmedBooking>("bookingRequests").find({ ...blockingFilter(from, to), "items.id": productId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { projection: { _id: 1, start: 1, end: 1, items: 1, schedule: 1 } }).toArray();
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

// Days the admin set by hand (admin queue editor).
export async function getEffectiveAvailability(db: Db, productId: number, from: string, to: string) {
  const [capacities, reservations] = await Promise.all([
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    getReservationCounts(db, productId, from, to),
  ]);
  return capacities.map(day => ({ date: day.date, remaining: Math.max(0, day.capacity - (reservations.get(day.date) || 0)) }));
}

// Every day in [from, to): a hand-set capacity wins, otherwise the pieces in service (stock) are the capacity.
export async function getQueue(db: Db, productId: number, from: string, to: string, exceptId?: string) {
  const [capacities, reservations, product] = await Promise.all([
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    getReservationCounts(db, productId, from, to, exceptId),
    db.collection<{ id: number; stock?: number }>("products").findOne({ id: productId }, { projection: { _id: 0, stock: 1 } }),
  ]);
  const set = new Map(capacities.map(day => [day.date, day.capacity]));
  const days: { date: string; remaining: number }[] = [];
  for (let date = from; date < to; date = addDays(date, 1)) days.push({ date, remaining: Math.max(0, (set.get(date) ?? product?.stock ?? 0) - (reservations.get(date) || 0)) });
  return days;
}
