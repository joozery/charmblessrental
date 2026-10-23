// Client-safe: money that changes after a booking was paid because the shop edited it (new dates, other pieces).
// The paid bill stays as it was; the difference is settled on its own, from the same bill link.
export type AdjustmentStatus = "unpaid" | "paid" | "refund" | "refunded";
export type Adjustment = {
  id: string; summary: string; amount: number; status: AdjustmentStatus; note?: string;
  createdAt: string | Date; createdByName: string; settledOn?: string; settledByName?: string;
};
export const adjustmentLabels: Record<AdjustmentStatus, string> = { unpaid: "รอลูกค้าชำระส่วนต่าง", paid: "ชำระส่วนต่างแล้ว", refund: "รอร้านคืนเงินส่วนต่าง", refunded: "คืนเงินส่วนต่างแล้ว" };
// What the customer owes for the rent beyond the paid bill: positive to pay, negative to get back.
export const openAdjustments = (list?: Adjustment[] | null) => (list || []).filter(item => item.status === "unpaid" || item.status === "refund");
export const adjustedRental = (rental: number, list?: Adjustment[] | null) => rental + (list || []).reduce((sum, item) => sum + item.amount, 0);
