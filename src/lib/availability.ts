export type AvailabilityStatus = "available" | "limited" | "full" | "unknown";
export type AvailabilityDay = { remaining: number; updatedAt: string };
// Populate from the shop's confirmed inventory/booking source. Missing dates are unknown, never assumed available.
export const productAvailability: Record<number, Record<string, AvailabilityDay>> = {};
export function getAvailability(productId: number, date: string, records: Record<string, AvailabilityDay> = productAvailability[productId] || {}): AvailabilityStatus {
  const day = records[date];
  if (!day || !Number.isInteger(day.remaining) || day.remaining < 0) return "unknown";
  return day.remaining === 0 ? "full" : day.remaining === 1 ? "limited" : "available";
}
export const availabilityLabels: Record<AvailabilityStatus, string> = {
  available: "ว่าง", limited: "เหลือชิ้นสุดท้าย", full: "ติดคิวเต็ม", unknown: "รอร้านอัปเดตคิว",
};
