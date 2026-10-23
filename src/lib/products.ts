import { effectivePricing, type ExtraDayRates, type RentalPricing } from "./pricing";
export type Product = {
  id: number; name: string; thai: string; category: string; color: string;
  dailyRate: number | null; image: string; images: string[]; tag: string; description: string;
  active?: boolean; stock?: number; size?: string; deposit?: number | null;
  legacyId?: string; sku?: string; cost?: number | null; legacyRevenue?: number | null;
  legacyProfit?: number | null; inventoryStatus?: string; notes?: string; imageStatus?: string;
  units?: ProductUnit[];
  // customPricing is the admin-set table for this product; pricing is what the storefront charges (custom, legacy daily rate or the shop table).
  customPricing?: RentalPricing | null; pricing?: RentalPricing | null;
  // Lowest parcel fee when this item is in the order, for bulky items (The North Face 80).
  shippingFee?: number | null;
  gapDays?: number | null;
};
// One physical piece of a product. `sku` is the piece code (A0002-03); the product's `sku` is the code shared by its pieces (A0002).
// After a rental a piece goes inspection → washing (or repair) → available; only "available" may be sent to the next customer.
export type UnitStatus = "available" | "rented" | "inspection" | "washing" | "repair" | "unavailable" | "retired";
export type ProductUnit = {
  sku: string; cost: number | null; status: UnitStatus; note: string; addedAt: Date | string | null;
  legacyProductId?: number; legacyId?: string; legacyRevenue?: number | null; legacyProfit?: number | null; image?: string;
};
export const unitStatusLabels: Record<UnitStatus, string> = { available: "พร้อมเช่า", rented: "อยู่กับลูกค้า", inspection: "รอตรวจสภาพ", washing: "รอซัก", repair: "รอซ่อม / ชำรุด", unavailable: "ไม่พร้อมเช่า", retired: "เลิกใช้แล้ว" };
export const prepStatuses: UnitStatus[] = ["inspection", "washing", "repair"];
// Pieces the shop still rents out, even while one is with a customer or being cleaned; the storefront lists a product while it has any.
export const inService = (status: UnitStatus) => status !== "unavailable" && status !== "retired";
// Products saved before pieces existed count as a single piece.
export function unitsOf(p: Product): ProductUnit[] {
  return p.units?.length ? p.units : [{ sku: p.sku || "", cost: p.cost ?? null, status: p.active === false ? "unavailable" : "available", note: "", addedAt: null, legacyProductId: p.id, legacyId: p.legacyId, legacyRevenue: p.legacyRevenue ?? null, legacyProfit: p.legacyProfit ?? null }];
}
export const categoryLabels: Record<string, string> = {
  dress: "ชุดออกงาน", winter: "เสื้อกันหนาว", jacket: "แจ็กเก็ต", boots: "รองเท้า",
  ...Object.fromEntries(["ชุดเซ็ต", "ขนเฟอร์", "เสื้อ", "หนัง", "ชุดเดรส", "สเวตเตอร์", "กางเกง", "JACKET", "ผ้าพันคอ", "กระเป๋า", "กล้อง", "รองเท้า", "หมวก", "กระโปรง", "โปรโมชั่น", "ฝากร้าน", "ค่าปรับ", "เครดิต", "การจ่ายเงิน"].map(c => [c,c])),
};
export function publicProduct(p: Product, shopPricing?: RentalPricing | null, extras?: ExtraDayRates): Product {
  return { id: p.id, name: p.name, thai: p.thai, category: p.category, color: p.color, dailyRate: p.dailyRate,
    image: p.image, images: p.images, tag: p.tag, description: p.description, active: p.active, stock: p.stock,
    size: p.size, deposit: p.deposit, sku: p.sku, shippingFee: p.shippingFee ?? null, pricing: effectivePricing(p, shopPricing, extras) };
}
