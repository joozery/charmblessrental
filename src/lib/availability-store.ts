import type { Db } from "mongodb";

type Capacity = { productId: number; date: string; capacity: number };
type ConfirmedBooking = { _id: string; start: string; end: string; items: { id: number }[] };

export async function getReservationCounts(db: Db, productId: number, from: string, to: string) {
  const bookings = await db.collection<ConfirmedBooking>("bookingRequests").find({ status: "confirmed", start: { $lt: to }, end: { $gt: from }, "items.id": productId }, { projection: { _id: 1, start: 1, end: 1, items: 1 } }).toArray();
  const result = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.items.some(item => item.id === productId)) continue;
    for (let date = booking.start; date < booking.end; date = nextDay(date)) {
      if (date >= from && date < to) result.set(date, (result.get(date) || 0) + 1);
    }
  }
  return result;
}

export async function getEffectiveAvailability(db: Db, productId: number, from: string, to: string) {
  const [capacities, reservations] = await Promise.all([
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    getReservationCounts(db, productId, from, to),
  ]);
  return capacities.map(day => ({ date: day.date, remaining: Math.max(0, day.capacity - (reservations.get(day.date) || 0)) }));
}

function nextDay(value: string) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
