import type { Db } from "mongodb";

export type DiscountCoupon = { _id: string; code: string; label: string; percent: number; active: boolean; startsAt?: string; endsAt?: string; maxUses?: number | null; usedCount: number; createdAt: Date; updatedAt: Date };
export type CustomerDiscount = { percent: number; label: string; bookingCount: number; reviewCount: number };

export const customerDiscount = (bookingCount = 0, reviewCount = 0): CustomerDiscount => {
  if (bookingCount >= 5 && reviewCount > 0) return { percent: 15, label: "ลูกค้าเก่า · เช่าครบ 5 ครั้งและรีวิวแล้ว", bookingCount, reviewCount };
  if (reviewCount > 0 && bookingCount > 0) return { percent: 10, label: "ลูกค้าเก่า · เคยเช่าและรีวิวแล้ว", bookingCount, reviewCount };
  if (bookingCount > 0) return { percent: 5, label: "ลูกค้าเก่า · กลับมาใช้ซ้ำ", bookingCount, reviewCount };
  return { percent: 0, label: "", bookingCount, reviewCount };
};

export const discountCoupons = (db: Db) => db.collection<DiscountCoupon>("discountCoupons");
export const cleanCode = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
export function validCoupon(coupon: DiscountCoupon | null, now = new Date()) {
  if (!coupon?.active || coupon.percent <= 0 || coupon.percent > 100 || coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) return false;
  const day = now.toISOString().slice(0, 10);
  return (!coupon.startsAt || day >= coupon.startsAt) && (!coupon.endsAt || day <= coupon.endsAt);
}
