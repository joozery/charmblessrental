// Client-safe: parcel carriers the shop offers and the "rent 2, ship free" promotion.
// leadDays: how many days before the first day of use the shop sends it.
export type ShippingOption = { id: string; label: string; fee: number; description: string; enabled: boolean; standard: boolean; leadDays: number };
export type FreeShipping = { enabled: boolean; minItems: number };
export const defaultShippingOptions: ShippingOption[] = [
  { id: "flash", label: "Flash / Kerry", fee: 50, description: "พัสดุมาตรฐาน ถึงใน 1–2 วัน", enabled: true, standard: true, leadDays: 3 },
  { id: "ems", label: "EMS ไปรษณีย์ไทย", fee: 70, description: "เหมาจ่าย ถึงใน 1–2 วัน", enabled: true, standard: false, leadDays: 3 },
  { id: "kerry-sameday", label: "Kerry Same Day", fee: 110, description: "ส่งด่วน ถึงภายในวัน", enabled: true, standard: false, leadDays: 1 },
];
export const defaultFreeShipping: FreeShipping = { enabled: true, minItems: 2 };
type Settings = { shippingOptions: ShippingOption[]; freeShipping: FreeShipping };
type Item = { shippingFee?: number | null };
export type ShippingQuote = { label: string; base: number | null; discount: number; fee: number | null };

export const enabledOptions = (settings: Settings) => settings.shippingOptions.filter(option => option.enabled);
export const freeEligible = (settings: Settings, count: number) => settings.freeShipping.enabled && count >= settings.freeShipping.minItems;
// Bulky items (The North Face 80) set the lowest parcel fee for the whole order.
const itemMinimum = (items: Item[]) => Math.max(0, ...items.map(item => item.shippingFee ?? 0));
// The free promotion pays the standard carrier's fee; a faster carrier or a messenger costs only the difference.
export function standardFee(settings: Settings, items: Item[]) {
  const fees = enabledOptions(settings).filter(option => option.standard).map(option => option.fee);
  return fees.length ? Math.max(Math.min(...fees), itemMinimum(items)) : 0;
}
export function shippingFor(settings: Settings, method: string, items: Item[], messengerFee: number | null): ShippingQuote | null {
  if (method === "pickup") return { label: "รับเองที่ร้าน", base: 0, discount: 0, fee: 0 };
  const credit = freeEligible(settings, items.length) ? standardFee(settings, items) : 0;
  if (method === "messenger") return { label: "แมสเซนเจอร์ (Grab / LINE MAN)", base: messengerFee, discount: messengerFee === null ? 0 : Math.min(messengerFee, credit), fee: messengerFee === null ? null : messengerFee - Math.min(messengerFee, credit) };
  const option = enabledOptions(settings).find(item => item.id === method);
  if (!option) return null;
  const base = Math.max(option.fee, itemMinimum(items));
  const discount = credit ? (option.standard ? base : Math.min(base, credit)) : 0;
  return { label: option.label, base, discount, fee: base - discount };
}
export function validShipping(options: unknown, free: unknown): boolean {
  const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000;
  if (!Array.isArray(options) || options.length < 1 || options.length > 10) return false;
  const ids = options.map(option => option?.id);
  return new Set(ids).size === ids.length && options.every(option => option && typeof option.id === "string" && /^[a-z0-9-]{1,30}$/.test(option.id) && !["pickup", "messenger"].includes(option.id) && typeof option.label === "string" && option.label.trim().length > 0 && option.label.length <= 80 && amount(option.fee) && typeof option.description === "string" && option.description.length <= 200 && typeof option.enabled === "boolean" && typeof option.standard === "boolean" && Number.isSafeInteger(option.leadDays) && option.leadDays >= 0 && option.leadDays <= 14)
    && !!free && typeof free === "object" && typeof (free as FreeShipping).enabled === "boolean" && Number.isSafeInteger((free as FreeShipping).minItems) && (free as FreeShipping).minItems >= 1 && (free as FreeShipping).minItems <= 20;
}
