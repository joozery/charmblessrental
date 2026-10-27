// Client-safe: one booking's place in a piece's queue, and which step of it falls on a given day (admin calendars).
export type QueueBooking = { id: string; name: string; confirmed: boolean; ship: string; start: string; end: string; returnDate: string; ready: string; unitSkus?: string[]; unassignedCount?: number; href?: string };
// A day where more bookings hold a piece than the shop owns, and the other bookings on it.
export type QueueClash = { date: string; item: string; with: { id: string; name: string }[] };
// A late (or about to be late) rental and the next booking waiting for the same piece; `swap` lists other pieces free for it.
export type NextRisk = { item: string; unitSku: string; next: { id: string; name: string; ship: string }; swap: string[] };
export type QueueRole = "ship" | "use" | "return" | "gap";
export const queueRoleLabels: Record<QueueRole, string> = { ship: "จัดส่ง", use: "ใช้งาน", return: "คืน", gap: "พักชุด" };
export const queueRole = (booking: QueueBooking, day: string): QueueRole | null => day < booking.ship || day >= booking.ready ? null : day < booking.start ? "ship" : day <= booking.end ? "use" : day === booking.returnDate ? "return" : "gap";
export const queueWeekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
export const shiftMonth = (month: string, by: number) => { const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); return date.toISOString().slice(0, 7); };
export const monthLabel = (month: string) => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
// The month as calendar cells: blanks before the 1st so each date sits under its weekday.
export function monthCells(month: string) {
  const first = new Date(`${month}-01T12:00:00Z`), count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return [...Array<null>(first.getUTCDay()).fill(null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
}
