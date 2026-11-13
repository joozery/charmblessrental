import type { Db } from "mongodb";

export type DiscountCoupon = { _id: string; code: string; label: string; percent: number; type?: CouponType; value?: number; active: boolean; startsAt?: string; endsAt?: string; maxUses?: number | null; usedCount: number; createdAt: Date; updatedAt: Date };
export type CouponType = "percent" | "amount";
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
  const value = couponValue(coupon);
  if (!coupon?.active || value <= 0 || couponType(coupon) === "percent" && value > 100 || coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) return false;
  const day = now.toISOString().slice(0, 10);
  return (!coupon.startsAt || day >= coupon.startsAt) && (!coupon.endsAt || day <= coupon.endsAt);
}

// Coupons saved before fixed-amount ones existed only have `percent`.
export const couponType = (coupon: DiscountCoupon | null | undefined): CouponType => coupon?.type === "amount" ? "amount" : "percent";
export const couponValue = (coupon: DiscountCoupon | null | undefined) => coupon ? coupon.value ?? coupon.percent ?? 0 : 0;
// Baht off `before` (the rental before discounts); never more than `before`.
export function couponDiscountAmount(coupon: DiscountCoupon | null | undefined, before: number) {
  if (!coupon || before <= 0) return 0;
  const value = couponValue(coupon);
  const amount = couponType(coupon) === "amount" ? value : before * Math.min(100, value) / 100;
  return Math.min(before, Math.round(Math.max(0, amount) * 100) / 100);
}
