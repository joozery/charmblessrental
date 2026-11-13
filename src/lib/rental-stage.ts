export type RentalStage = "cancelled" | "pending" | "paid" | "preparing" | "shipped" | "received" | "returning" | "returned";
type StageInput = { status: string; payment?: string; method?: string; shipment?: unknown; customerReturn?: unknown; returned?: unknown; receivedCondition?: unknown; photos?: { beforeShipment?: unknown[] } };
export function rentalStage(row: StageInput): RentalStage {
  if (row.status === "cancelled") return "cancelled";
  if (row.returned) return "returned";
  if (row.customerReturn) return "returning";
  if (row.receivedCondition) return "received";
  if (row.shipment) return "shipped";
  if (row.payment === "paid" && row.photos?.beforeShipment?.length) return "preparing";
  return row.payment === "paid" ? "paid" : "pending";
}
export const stageSteps: RentalStage[] = ["pending", "paid", "preparing", "shipped", "received", "returning", "returned"];
export function stageLabel(stage: RentalStage, method?: string) {
  const pickup = method === "pickup";
  return { cancelled: "ยกเลิก", pending: "รอชำระเงิน", paid: pickup ? "ชำระเงินแล้ว / รอรับสินค้า" : "ชำระเงินแล้ว / รอจัดส่ง", preparing: "รูปก่อนจัดส่ง", shipped: pickup ? "ส่งมอบแล้ว" : "จัดส่งแล้ว", received: "ลูกค้าแจ้งสภาพสินค้า", returning: "ลูกค้าส่งคืนแล้ว / รอร้านรับสินค้า", returned: "ร้านรับสินค้าคืนแล้ว" }[stage];
}
export const returnCarriers = ["ไปรษณีย์ไทย", "Flash Express", "Kerry Express", "J&T Express", "แมสเซนเจอร์ (Grab / Lalamove)", "คืนที่ร้าน"];
export const needsTracking = (carrier: string) => !/คืนที่ร้าน|แมสเซนเจอร์|grab|lalamove/i.test(carrier);
