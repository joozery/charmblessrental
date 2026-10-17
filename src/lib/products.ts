export type Product = {
  id: number; name: string; thai: string; category: string; color: string;
  dailyRate: number | null; image: string; images: string[]; tag: string; description: string;
  active?: boolean; stock?: number; size?: string; deposit?: number | null;
  legacyId?: string; sku?: string; cost?: number | null; legacyRevenue?: number | null;
  legacyProfit?: number | null; inventoryStatus?: string; notes?: string; imageStatus?: string;
};
export const categoryLabels: Record<string, string> = {
  dress: "ชุดออกงาน", winter: "เสื้อกันหนาว", jacket: "แจ็กเก็ต", boots: "รองเท้า",
  ...Object.fromEntries(["ชุดเซ็ต", "ขนเฟอร์", "เสื้อ", "หนัง", "ชุดเดรส", "สเวตเตอร์", "กางเกง", "JACKET", "ผ้าพันคอ", "กระเป๋า", "กล้อง", "รองเท้า", "หมวก", "กระโปรง", "โปรโมชั่น", "ฝากร้าน", "ค่าปรับ", "เครดิต", "การจ่ายเงิน"].map(c => [c,c])),
};
export function publicProduct(p: Product): Product {
  return { id: p.id, name: p.name, thai: p.thai, category: p.category, color: p.color, dailyRate: p.dailyRate,
    image: p.image, images: p.images, tag: p.tag, description: p.description, active: p.active, stock: p.stock,
    size: p.size, deposit: p.deposit, sku: p.sku };
}
