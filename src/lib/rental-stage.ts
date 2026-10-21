// Client-safe: where a rental is in its life, derived from payment, shipment and return records.
export type RentalStage = "cancelled" | "pending" | "paid" | "shipped" | "returning" | "returned";
type StageInput = { status: string; payment?: string; method?: string; shipment?: unknown; customerReturn?: unknown; returned?: unknown };

export function rentalStage(row: StageInput): RentalStage {
  if (row.status === "cancelled") return "cancelled";
  if (row.returned) return "returned";
  if (row.customerReturn) return "returning";
  if (row.shipment) return "shipped";
  return row.payment === "paid" ? "paid" : "pending";
}
export const stageSteps: RentalStage[] = ["pending", "paid", "shipped", "returning", "returned"];
export function stageLabel(stage: RentalStage, method?: string) {
  const pickup = method === "pickup";
  return {
    cancelled: "ยกเลิก", pending: "รอชำระเงิน", paid: pickup ? "ชำระเงินแล้ว / รอรับสินค้า" : "ชำระเงินแล้ว / รอจัดส่ง",
    shipped: pickup ? "รับสินค้าแล้ว" : "จัดส่งแล้ว", returning: "ลูกค้าส่งคืนแล้ว / รอร้านรับสินค้า", returned: "ร้านรับสินค้าคืนแล้ว",
  }[stage];
}
export const returnCarriers = ["ไปรษณีย์ไทย", "Flash Express", "Kerry Express", "J&T Express", "แมสเซนเจอร์ (Grab / Lalamove)", "คืนที่ร้าน"];
// Handing back in person or by messenger has no tracking number.
export const needsTracking = (carrier: string) => !/คืนที่ร้าน|แมสเซนเจอร์|grab|lalamove/i.test(carrier);
