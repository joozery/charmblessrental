// Client-safe: messenger (Grab / LINE MAN) fee by road distance from the shop.
export type LatLng = { lat: number; lng: number };
export type MessengerSettings = {
  enabled: boolean; origin: LatLng | null; originLabel: string;
  baseFee: number; includedKm: number; perKm: number; maxKm: number | null;
  inBill: boolean; description: string;
};
export const defaultMessenger: MessengerSettings = {
  enabled: false, origin: null, originLabel: "", baseFee: 40, includedKm: 3, perKm: 10, maxKm: 50, inBill: true,
  description: "ร้านเรียกแมสเซนเจอร์ (Grab / LINE MAN) ส่งถึงที่อยู่ของคุณ ค่าส่งคิดตามระยะทางจริงจากร้าน",
};
// e.g. base 40 covers the first 3 km, then 10 per started km: 7.2 km → 40 + 5 × 10 = 90.
export function messengerFee(settings: MessengerSettings, km: number) {
  return Math.round(settings.baseFee + Math.max(0, Math.ceil(km - 1e-9) - settings.includedKm) * settings.perKm);
}
export const validLatLng = (value: unknown): value is LatLng => !!value && typeof value === "object" && Number.isFinite((value as LatLng).lat) && Number.isFinite((value as LatLng).lng) && Math.abs((value as LatLng).lat) <= 90 && Math.abs((value as LatLng).lng) <= 180;

// Reads coordinates out of the usual Google Maps link shapes, or a plain "13.75, 100.50".
export function parseLatLng(text: string): LatLng | null {
  const value = decodeURIComponent(text.trim());
  const patterns = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const point = match && { lat: Number(match[1]), lng: Number(match[2]) };
    if (point && validLatLng(point)) return point;
  }
  return null;
}
export const mapsLink = (point: LatLng) => `https://www.google.com/maps?q=${point.lat},${point.lng}`;
