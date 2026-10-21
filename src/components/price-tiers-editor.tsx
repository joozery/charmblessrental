"use client";
import { suggestedDays, type RentalPricing } from "@/lib/pricing";

const amount = (value: string) => value === "" ? null : Number(value);
// Rows are edited as text so a half-typed number does not jump; parent receives a clean RentalPricing.
export type TierRow = { days: string; price: string };
export const rowsFrom = (pricing: RentalPricing | null | undefined): TierRow[] => pricing?.tiers.length ? pricing.tiers.map(tier => ({ days: String(tier.days), price: String(tier.price) })) : suggestedDays.map(days => ({ days: String(days), price: "" }));
export function pricingFrom(rows: TierRow[], extra: string): RentalPricing | string {
  const tiers = rows.filter(row => row.price.trim() !== "").map(row => ({ days: Number(row.days), price: Number(row.price) }));
  if (tiers.some(tier => !Number.isSafeInteger(tier.days) || tier.days < 1 || tier.days > 90)) return "จำนวนวันต้องเป็นเลข 1–90";
  if (tiers.some(tier => !Number.isFinite(tier.price) || tier.price < 0)) return "ราคาต้องเป็นตัวเลขตั้งแต่ 0";
  if (new Set(tiers.map(tier => tier.days)).size !== tiers.length) return "มีจำนวนวันซ้ำกัน";
  const extraPerDay = amount(extra.trim());
  if (extraPerDay !== null && (!Number.isFinite(extraPerDay) || extraPerDay < 0)) return "ราคาวันที่เกินต้องเป็นตัวเลขตั้งแต่ 0";
  return { tiers: tiers.sort((a, b) => a.days - b.days), extraPerDay: tiers.length ? extraPerDay : null };
}

export default function PriceTiersEditor({ rows, extra, onChange, showExtra = true, extraHint = "เว้นว่าง = ให้ลูกค้าสอบถาม" }: { rows: TierRow[]; extra: string; onChange: (rows: TierRow[], extra: string) => void; showExtra?: boolean; extraHint?: string }) {
  const longest = Math.max(0, ...rows.filter(row => row.price.trim()).map(row => Number(row.days) || 0));
  return <div className="price-tiers">
    <div className="price-tiers-head" aria-hidden="true"><span>จำนวนวัน</span><span>ราคา (บาท)</span><span /></div>
    {rows.map((row, index) => <div className="price-tiers-row" key={index}>
      <label><span className="admin-sr-only">จำนวนวัน แถว {index + 1}</span><input type="number" min="1" max="90" step="1" inputMode="numeric" value={row.days} onChange={event => onChange(rows.map((item, i) => i === index ? { ...item, days: event.target.value } : item), extra)} /><em>วัน</em></label>
      <label><span className="admin-sr-only">ราคา {row.days || "?"} วัน</span><input type="number" min="0" step="1" inputMode="decimal" value={row.price} placeholder="ไม่เปิดให้เช่า" onChange={event => onChange(rows.map((item, i) => i === index ? { ...item, price: event.target.value } : item), extra)} /></label>
      <button type="button" aria-label={`ลบแถว ${row.days || index + 1} วัน`} onClick={() => onChange(rows.filter((_, i) => i !== index), extra)}>×</button>
    </div>)}
    {rows.length < 12 && <button type="button" className="price-tiers-add" onClick={() => onChange([...rows, { days: "", price: "" }], extra)}>+ เพิ่มจำนวนวัน</button>}
    {showExtra && <label className="price-tiers-extra"><span>เกิน {longest || "แพ็กเกจสูงสุด"} วัน คิดเพิ่มวันละ (บาท)</span><input type="number" min="0" step="1" inputMode="decimal" value={extra} placeholder={extraHint} onChange={event => onChange(rows, event.target.value)} /></label>}
    <small>เช่าจำนวนวันที่ไม่มีในตาราง จะคิดราคาของแพ็กเกจถัดไป เช่น 4 วันคิดราคา 5 วัน</small>
  </div>;
}
