import type { Db } from "mongodb";
import { addDays } from "@/lib/schedule";
import { legacyHolds } from "@/lib/legacy-rentals";

type Booking = { _id: string; status?: string; start: string; end: string; items?: { id: number; variantId?: string; quantity?: number }[] };
type Capacity = { productId: number; date: string; capacity: number };

// Admin override: a product's post-rental Gap is not counted as occupied here.
// Actual customer-use dates are still protected from overlapping admin bookings.
export async function adminUseQueue(db: Db, productId: number, from: string, to: string, exceptId?: string, variantId?: string) {
  const [product, capacities, bookings, imported] = await Promise.all([
    db.collection<{ id: number; stock?: number; variants?: { id: string }[]; units?: { variantId?: string; status: string }[] }>("products").findOne({ id: productId }, { projection: { _id: 0, id: 1, stock: 1, variants: 1, units: 1 } }),
    db.collection<Capacity>("productAvailability").find({ productId, date: { $gte: from, $lt: to } }, { projection: { _id: 0, date: 1, capacity: 1 } }).toArray(),
    db.collection<Booking>("bookingRequests").find({ _id: { $ne: exceptId }, status: { $ne: "cancelled" }, "items.id": productId }, { projection: { _id: 1, status: 1, start: 1, end: 1, items: 1 } }).toArray(),
    legacyHolds(db, from, to, productId),
  ]);
  const variant = product?.variants?.some(row => row.id === variantId) ? variantId : undefined;
  const stock = variant
    ? (product?.units || []).filter(unit => unit.variantId === variant && unit.status !== "unavailable" && unit.status !== "retired").length
    : product?.variants?.length
      ? (product.units || []).filter(unit => unit.status !== "unavailable" && unit.status !== "retired").length
      : product?.stock ?? 0;
  const capacity = new Map(capacities.map(row => [row.date, Math.min(row.capacity, stock)]));
  const days: { date: string; remaining: number }[] = [];
  for (let date = from; date < to; date = addDays(date, 1)) {
    const reserved = bookings.reduce((sum, booking) => {
      if (date < booking.start || date > booking.end) return sum;
      const item = booking.items?.find(row => row.id === productId && (!variant || row.variantId === variant));
      // A booking for another variant of the same product does not occupy this variant.
      return sum + (item?.quantity ?? 0);
    }, 0) + imported.filter(hold => hold.start <= date && date <= hold.end).length;
    days.push({ date, remaining: Math.max(0, (capacity.get(date) ?? stock) - reserved) });
  }
  return days;
}
