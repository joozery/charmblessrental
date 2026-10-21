import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { messengerFee, parseLatLng, type LatLng, type MessengerSettings } from "./delivery";

export type DeliveryQuote = { km: number; fee: number; location: LatLng; address: string };
type Cached = { _id: string; value: unknown; at: Date };
const key = () => process.env.GOOGLE_MAPS_API_KEY || "";
export const mapsConfigured = () => !!key();

// Google calls cost money per request, so results are kept for 30 days.
async function cached<T>(db: Db, id: string, load: () => Promise<T | null>) {
  const collection = db.collection<Cached>("deliveryCache");
  const hit = await collection.findOne({ _id: id });
  if (hit) return hit.value as T | null;
  const value = await load();
  if (value !== null) {
    await collection.createIndex({ at: 1 }, { expireAfterSeconds: 30 * 86400 }).catch(() => undefined);
    await collection.updateOne({ _id: id }, { $set: { value, at: new Date() } }, { upsert: true });
  }
  return value;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

// Short share links (maps.app.goo.gl/…) only reveal coordinates after their redirect; only Google hosts are followed.
async function expandLink(link: string) {
  let url = link.trim();
  for (let hop = 0; hop < 4; hop++) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return url; }
    if (parsed.protocol !== "https:" || !/^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/.test(parsed.hostname)) return url;
    if (parseLatLng(url)) return url;
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) }).catch(() => null);
    const next = response?.headers.get("location");
    if (!next) return url;
    url = new URL(next, url).toString();
  }
  return url;
}

export const resolvePin = async (link: string) => parseLatLng(await expandLink(link));

async function geocode(db: Db, address: string) {
  const text = address.replace(/\s+/g, " ").trim();
  return cached<{ location: LatLng; address: string }>(db, `geo:${hash(text)}`, async () => {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address: text, region: "th", language: "th", key: key() })}`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => null);
    const first = data?.results?.[0];
    if (data?.status !== "OK" || !first) { if (data?.status && data.status !== "ZERO_RESULTS") console.error("Geocoding failed:", data.status, data.error_message); return null; }
    return { location: { lat: first.geometry.location.lat, lng: first.geometry.location.lng }, address: first.formatted_address };
  });
}

async function roadKm(db: Db, from: LatLng, to: LatLng) {
  const round = (point: LatLng) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
  return cached<number>(db, `route:${round(from)}:${round(to)}`, async () => {
    // Two-wheeler matches how Grab / LINE MAN riders travel; driving is the fallback where it has no route.
    for (const travelMode of ["TWO_WHEELER", "DRIVE"]) {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "routes.distanceMeters" },
        body: JSON.stringify({ origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } }, destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } }, travelMode }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) { console.error("Routes API failed:", response.status, JSON.stringify(data).slice(0, 300)); continue; }
      const meters = data?.routes?.[0]?.distanceMeters;
      if (typeof meters === "number") return Math.round(meters / 100) / 10;
    }
    return null;
  });
}

// Finds where the customer is (pin first, else the typed address) and prices the ride from the shop.
export async function quoteDelivery(db: Db, settings: MessengerSettings, input: { pin?: string; address?: string }): Promise<DeliveryQuote | { error: string }> {
  if (!settings.enabled || !settings.origin) return { error: "ร้านยังไม่ได้เปิดคำนวณค่าส่งอัตโนมัติ ร้านจะแจ้งค่าส่งให้ภายหลัง" };
  if (!mapsConfigured()) return { error: "ระบบคำนวณระยะทางยังไม่พร้อม ร้านจะแจ้งค่าส่งให้ภายหลัง" };
  let location = input.pin ? parseLatLng(await expandLink(input.pin)) : null, address = "";
  if (!location && input.address?.trim()) { const found = await geocode(db, input.address); if (found) ({ location, address } = found); }
  if (!location) return { error: input.pin ? "อ่านตำแหน่งจากลิงก์หมุดไม่ได้ กรุณาวางลิงก์จาก Google Maps อีกครั้ง หรือกรอกที่อยู่ให้ละเอียดขึ้น" : "หาตำแหน่งจากที่อยู่นี้ไม่เจอ กรุณากรอกให้ละเอียดขึ้น หรือแนบหมุด Google Maps" };
  const km = await roadKm(db, settings.origin, location);
  if (km === null) return { error: "คำนวณเส้นทางไม่ได้ ร้านจะแจ้งค่าส่งให้ภายหลัง" };
  if (settings.maxKm && km > settings.maxKm) return { error: `ระยะทาง ${km} กม. เกินระยะที่ร้านส่งแมสได้ (${settings.maxKm} กม.) กรุณาเลือกส่งไปรษณีย์ หรือติดต่อร้าน` };
  return { km, fee: messengerFee(settings, km), location, address };
}
