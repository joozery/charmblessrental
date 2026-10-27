import type { Db } from "mongodb";
import { addDays } from "@/lib/schedule";
import { legacyHolds } from "@/lib/legacy-rentals";

type Booking = { _id: string; status?: string; start: string; end: string; items?: { id: number; quantity?: number }[] };
type Capacity = { productId: number; date: string; capacity: number };

// Admin override: a product's post-rental Gap is not counted as occupied here.
// Actual customer-use dates are still protected from overlapping admin bookings.
export async function adminUseQueue(db: Db, productId: number, from: string, to: string, exceptId?: string) {
  const [product, capacities, bookings, imported] = await Promise.all([
    db.collection<{ id: number; stock?: number }>("products").findOne({ id: productId }, { projection: { _id: 0, id: 1, stock: 1 } }),
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    db.collection<Booking>("bookingRequests").find({ _id: { $ne: exceptId }, status: { $ne: "cancelled" }, "items.id": productId }, { projection: { _id: 1, status: 1, start: 1, end: 1, items: 1 } }).toArray(),
    legacyHolds(db, from, to, productId),
  ]);
  const capacity = new Map(capacities.map(row => [row.date, row.capacity]));
  const days: { date: string; remaining: number }[] = [];
  for (let date = from; date < to; date = addDays(date, 1)) {
    const reserved = bookings.reduce((sum, booking) => {
      if (date < booking.start || date > booking.end) return sum;
      const item = booking.items?.find(row => row.id === productId);
      return sum + (item?.quantity ?? 1);
    }, 0) + imported.filter(hold => hold.start <= date && date <= hold.end).length;
    days.push({ date, remaining: Math.max(0, (capacity.get(date) ?? product?.stock ?? 0) - reserved) });
  }
  return days;
}
