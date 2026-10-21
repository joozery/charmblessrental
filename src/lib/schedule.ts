// Client-safe: the days a rental takes a piece out of the queue, as in the shop's "นับวันเช่าและการเว้น Gap" chart.
// Use 19–28 Nov (10 days, both ends counted) → ship 16 (3 days ahead) → return 29 → gap 30, 1 → free again 2 Dec.
export type ReturnMethod = "parcel" | "messenger" | "shop";
export type ScheduleSettings = { pickupLead: number; messengerLead: number; gap: Record<ReturnMethod, number> };
export const defaultSchedule: ScheduleSettings = { pickupLead: 1, messengerLead: 1, gap: { parcel: 2, messenger: 1, shop: 1 } };
export const returnMethods: { key: ReturnMethod; label: string }[] = [{ key: "parcel", label: "ส่งพัสดุคืน" }, { key: "messenger", label: "Messenger" }, { key: "shop", label: "คืนที่ร้าน" }];
export const isReturnMethod = (value: unknown): value is ReturnMethod => returnMethods.some(item => item.key === value);

export const addDays = (day: string, count: number) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
export const countUseDays = (start: string, end: string) => start && end && end >= start ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1 : 0;

export type RentalPlan = { ship: string; start: string; end: string; returnDate: string; ready: string; lead: number; gap: number; days: number };
// `ready` is the first day the piece can start its next rental's shipping; the block is [ship, ready).
export function planRental(start: string, end: string, lead: number, gap: number): RentalPlan {
  const returnDate = addDays(end, 1);
  return { ship: addDays(start, -lead), start, end, returnDate, ready: addDays(returnDate, gap + 1), lead, gap, days: countUseDays(start, end) };
}
type LeadSource = { schedule: ScheduleSettings; shippingOptions: { id: string; leadDays?: number }[] };
export function leadDaysFor(settings: LeadSource, method: string) {
  if (method === "pickup") return settings.schedule.pickupLead;
  if (method === "messenger") return settings.schedule.messengerLead;
  return settings.shippingOptions.find(option => option.id === method)?.leadDays ?? 3;
}
export const planFor = (settings: LeadSource, start: string, end: string, method: string, returnMethod: ReturnMethod) => planRental(start, end, leadDaysFor(settings, method), settings.schedule.gap[returnMethod]);

export type DayRole = "ship" | "transit" | "use" | "return" | "gap" | "ready";
export function dayRole(plan: RentalPlan, day: string): DayRole | null {
  if (day === plan.ship) return "ship";
  if (day > plan.ship && day < plan.start) return "transit";
  if (day >= plan.start && day <= plan.end) return "use";
  if (day === plan.returnDate) return "return";
  if (day > plan.returnDate && day < plan.ready) return "gap";
  return day === plan.ready ? "ready" : null;
}
export const dayRoleLabels: Record<DayRole, string> = { ship: "จัดส่งให้ลูกค้า", transit: "ระหว่างจัดส่ง", use: "ลูกค้าใช้งานชุด", return: "ส่งคืนชุด", gap: "Gap", ready: "รับคิวใหม่ได้" };
export function planDays(plan: RentalPlan) { const days: string[] = []; for (let day = plan.ship; day <= plan.ready; day = addDays(day, 1)) days.push(day); return days; }
// Stored on a booking so the queue, reminders and the customer's bill all read the same dates.
export const scheduleRecord = (plan: RentalPlan, returnMethod: ReturnMethod) => ({ ship: plan.ship, returnDate: plan.returnDate, ready: plan.ready, lead: plan.lead, gap: plan.gap, returnMethod });
export type ScheduleRecord = ReturnType<typeof scheduleRecord>;
// Bookings made before schedules existed: `end` was the return day and only [start, end) was reserved.
type Dated = { start: string; end: string; schedule?: ScheduleRecord | null };
export const returnDay = (booking: Dated) => booking.schedule?.returnDate ?? booking.end;
export const blockRange = (booking: Dated) => booking.schedule ? { from: booking.schedule.ship, to: booking.schedule.ready } : { from: booking.start, to: booking.end };
export function validSchedule(value: unknown): value is ScheduleSettings {
  const day = (item: unknown) => Number.isSafeInteger(item) && (item as number) >= 0 && (item as number) <= 14;
  const v = value as ScheduleSettings | null;
  return !!v && day(v.pickupLead) && day(v.messengerLead) && !!v.gap && returnMethods.every(item => day(v.gap[item.key]));
}
