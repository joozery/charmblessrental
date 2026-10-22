// Client-safe: renting the same pieces for more days. The booking keeps its original start/end and bill;
// each extension moves the return day and the gap later, and is paid on its own from the same bill link.
import { addDays, type ScheduleRecord } from "./schedule";

export type ExtensionStatus = "unpaid" | "paid" | "cancelled";
export type Extension = {
  id: string; fromEnd: string; toEnd: string; addedDays: number; amount: number; status: ExtensionStatus;
  createdAt: string | Date; createdByName: string;
  // The shop's note (e.g. a delayed flight), and the days it knowingly ran into another booking.
  note?: string; clashDates?: string[];
  paidOn?: string; paidByName?: string; cancelledAt?: string | Date; cancelledByName?: string;
};
export const extensionLabels: Record<ExtensionStatus, string> = { unpaid: "รอชำระค่าเช่าต่อ", paid: "ชำระค่าเช่าต่อแล้ว", cancelled: "ยกเลิกแล้ว" };
export const activeExtensions = (list?: Extension[] | null) => (list || []).filter(item => item.status !== "cancelled");
// The last day of use after every extension still in force.
export const lastUseDay = (booking: { end: string; extensions?: Extension[] | null }) => activeExtensions(booking.extensions).at(-1)?.toEnd ?? booking.end;
export const extendedDays = (booking: { extensions?: Extension[] | null }) => activeExtensions(booking.extensions).reduce((sum, item) => sum + item.addedDays, 0);
// Return day and gap slide by the days added; shipping stays where it was.
export const shiftSchedule = (schedule: ScheduleRecord, days: number): ScheduleRecord => ({ ...schedule, returnDate: addDays(schedule.returnDate, days), ready: addDays(schedule.ready, days) });
