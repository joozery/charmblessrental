// Client-safe rental pricing by length of rental: 1 day 180, 3 days 220, 5 days 290…
export type PriceTier = { days: number; price: number };
export type RentalPricing = { tiers: PriceTier[]; extraPerDay: number | null };
export const emptyPricing: RentalPricing = { tiers: [], extraPerDay: null };
export const suggestedDays = [1, 3, 5, 7, 10];

const sorted = (pricing: RentalPricing) => [...pricing.tiers].sort((a, b) => a.days - b.days);
// A length between packages is charged as the next package up (4 days → 5-day price).
// Beyond the longest package, each extra day adds extraPerDay; without it the price is "ask the shop".
export function priceFor(pricing: RentalPricing | null | undefined, days: number): number | null {
  if (!pricing?.tiers.length || days < 1) return null;
  const tiers = sorted(pricing);
  const tier = tiers.find(item => item.days >= days);
  if (tier) return tier.price;
  const longest = tiers[tiers.length - 1];
  return pricing.extraPerDay == null ? null : longest.price + (days - longest.days) * pricing.extraPerDay;
}
export const startingTier = (pricing: RentalPricing | null | undefined) => pricing?.tiers.length ? sorted(pricing)[0] : null;
export const tiersOf = (pricing: RentalPricing | null | undefined) => pricing ? sorted(pricing) : [];

// Days beyond the longest package: a product's own rate wins, else its category's (cameras 100), else the shop's (50).
export type ExtraDayRates = { perDay: number | null; byCategory: Record<string, number> };
export const defaultExtraDayRates: ExtraDayRates = { perDay: null, byCategory: {} };
type Priced = { customPricing?: RentalPricing | null; dailyRate?: number | null; category?: string };
const extraFor = (product: Priced, shop: RentalPricing | null | undefined, extras?: ExtraDayRates) => (product.category && extras?.byCategory[product.category] !== undefined ? extras.byCategory[product.category] : extras?.perDay ?? shop?.extraPerDay ?? null);
// Product's own table first, then a legacy per-day rate, then the shop-wide table.
export function effectivePricing(product: Priced, shop: RentalPricing | null | undefined, extras?: ExtraDayRates): RentalPricing | null {
  if (product.customPricing?.tiers.length) return product.customPricing.extraPerDay == null ? { ...product.customPricing, extraPerDay: extraFor(product, shop, extras) } : product.customPricing;
  if (typeof product.dailyRate === "number") return { tiers: [{ days: 1, price: product.dailyRate }], extraPerDay: product.dailyRate };
  return shop?.tiers.length ? { ...shop, extraPerDay: extraFor(product, shop, extras) } : null;
}
export function validExtraRates(value: unknown): value is ExtraDayRates {
  if (!value || typeof value !== "object") return false;
  const { perDay, byCategory } = value as Record<string, unknown>;
  const amount = (item: unknown) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 100000;
  return (perDay === null || amount(perDay)) && !!byCategory && typeof byCategory === "object" && Object.keys(byCategory).length <= 50 && Object.entries(byCategory).every(([key, item]) => key.length > 0 && key.length <= 60 && amount(item));
}

export function validPricing(value: unknown): value is RentalPricing {
  if (!value || typeof value !== "object") return false;
  const { tiers, extraPerDay } = value as Record<string, unknown>;
  const amount = (item: unknown) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1000000;
  if (!Array.isArray(tiers) || tiers.length > 12 || !(extraPerDay === null || amount(extraPerDay))) return false;
  const days = tiers.map(tier => tier?.days);
  return tiers.every(tier => tier && Number.isSafeInteger(tier.days) && tier.days >= 1 && tier.days <= 90 && amount(tier.price)) && new Set(days).size === days.length;
}
export const cleanPricing = (pricing: RentalPricing): RentalPricing => ({ tiers: sorted(pricing).map(tier => ({ days: tier.days, price: Math.round(tier.price * 100) / 100 })), extraPerDay: pricing.extraPerDay == null ? null : Math.round(pricing.extraPerDay * 100) / 100 });

// Deposit for one product: its own figure when set (0 means none), else its category's, else none.
export type CategoryDeposits = Record<string, number>;
export const depositFor = (product: { deposit?: number | null; category?: string }, byCategory: CategoryDeposits) => product.deposit ?? (product.category ? byCategory[product.category] : undefined) ?? 0;
export const validCategoryDeposits = (value: unknown): value is CategoryDeposits => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= 50 && Object.entries(value).every(([key, item]) => key.length > 0 && key.length <= 60 && typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1000000);
