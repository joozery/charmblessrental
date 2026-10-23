"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import PriceTiersEditor, { pricingFrom, rowsFrom } from "@/components/price-tiers-editor";
import { priceFor, type ExtraDayRates, type RentalPricing } from "@/lib/pricing";
import type { LateRates } from "@/lib/extension";

type History = { days: number; count: number; average: number };
// After the piece has gone out: extending is a flat rate per piece per day; returning late is a fine per piece per day.
function LateRatesForm({ initial }: { initial: LateRates }) {
  const [form, setForm] = useState({ afterShipPerDay: String(initial.afterShipPerDay), lateFinePerDay: String(initial.lateFinePerDay) });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const rates = { afterShipPerDay: Number(form.afterShipPerDay), lateFinePerDay: Number(form.lateFinePerDay) };
    if (!(rates.afterShipPerDay >= 0) || !(rates.lateFinePerDay >= 0) || form.afterShipPerDay.trim() === "" || form.lateFinePerDay.trim() === "") { setError("กรอกเป็นตัวเลขตั้งแต่ 0"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/rental-pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "late", rates }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setNotice("บันทึกแล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return <form className="rental-pricing-card delivery-form" onSubmit={save}>
    <h2>เช่าต่อและคืนช้า</h2>
    <p>ขยายวันก่อนส่งชุด คิดตามตารางราคาเช่า ส่วนหลังส่งชุดถึงลูกค้าแล้วใช้อัตราด้านล่าง (ต่อชุด ต่อวัน)</p>
    <label>ขยายวันหลังส่งชุดแล้ว วันละ (บาท)<input type="number" min="0" step="1" value={form.afterShipPerDay} onChange={event => setForm({ ...form, afterShipPerDay: event.target.value })} /></label>
    <label>ค่าปรับคืนช้า วันละ (บาท)<input type="number" min="0" step="1" value={form.lateFinePerDay} onChange={event => setForm({ ...form, lateFinePerDay: event.target.value })} /></label>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกอัตรา"}</Button></div>
  </form>;
}
// Days beyond a product's longest package: one shop-wide rate, with overrides per category.
function ExtraRates({ initial, categories }: { initial: ExtraDayRates; categories: string[] }) {
  const [perDay, setPerDay] = useState(initial.perDay == null ? "" : String(initial.perDay));
  const [rows, setRows] = useState(Object.entries(initial.byCategory).map(([category, value]) => ({ category, perDay: String(value) })));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const filled = rows.filter(row => row.category && row.perDay.trim() !== "");
    const rates = { perDay: perDay.trim() === "" ? null : Number(perDay), byCategory: Object.fromEntries(filled.map(row => [row.category, Number(row.perDay)])) };
    if ((rates.perDay !== null && !(rates.perDay >= 0)) || filled.some(row => !(Number(row.perDay) >= 0))) { setError("ค่าเช่าส่วนเกินต้องเป็นตัวเลขตั้งแต่ 0"); return; }
    if (new Set(filled.map(row => row.category)).size !== filled.length) { setError("มีหมวดซ้ำกัน"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/rental-pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extra", rates }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setNotice("บันทึกแล้ว ใช้กับทุกสินค้าที่ไม่ได้ตั้งค่าส่วนเกินเอง");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return <form className="rental-pricing-card delivery-form" onSubmit={save}>
    <h2>ค่าเช่าส่วนเกิน</h2>
    <p>เช่าเกินแพ็กเกจสูงสุดของสินค้า (เช่น เกิน 10 วัน) คิดเรทแพ็กเกจสูงสุด แล้วบวกเพิ่มตามจำนวนวันที่เกิน เช่น 14 วัน = เรท 10 วัน + 4 วัน</p>
    <label>สินค้าทั่วไป วันละ (บาท)<input type="number" min="0" step="1" value={perDay} placeholder="เว้นว่าง = ให้ลูกค้าสอบถาม" onChange={event => setPerDay(event.target.value)} /></label>
    {rows.map((row, index) => <div className="delivery-inline" key={index}><select aria-label="หมวดสินค้า" value={row.category} onChange={event => setRows(rows.map((item, at) => at === index ? { ...item, category: event.target.value } : item))}><option value="">เลือกหมวด</option>{[...new Set([...categories, row.category].filter(Boolean))].map(category => <option key={category} value={category}>{category}</option>)}</select><input type="number" min="0" step="1" aria-label="วันละ (บาท)" placeholder="วันละ" value={row.perDay} onChange={event => setRows(rows.map((item, at) => at === index ? { ...item, perDay: event.target.value } : item))} /><Button type="button" variant="outline" onClick={() => setRows(rows.filter((_, at) => at !== index))}>ลบ</Button></div>)}
    <Button type="button" variant="outline" onClick={() => setRows([...rows, { category: "", perDay: "" }])}>+ ตั้งราคาเฉพาะหมวด (เช่น กล้อง)</Button>
    <p className="delivery-help">สินค้าที่ตั้ง &ldquo;เกินวันละ&rdquo; ไว้ในราคาเฉพาะสินค้า จะใช้ค่าของสินค้านั้นก่อน</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกค่าส่วนเกิน"}</Button></div>
  </form>;
}

export default function RentalPricingSettings({ initial, history, customCount, rates, lateRates, categories }: { initial: RentalPricing; history: History[]; customCount: number; rates: ExtraDayRates; lateRates: LateRates; categories: string[] }) {
  const [rows, setRows] = useState(rowsFrom(initial));
  const [extra, setExtra] = useState(initial.extraPerDay == null ? "" : String(initial.extraPerDay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pricing = pricingFrom(rows, extra);
  const preview = typeof pricing === "string" ? null : { ...pricing, extraPerDay: rates.perDay ?? pricing.extraPerDay };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (typeof pricing === "string") { setError(pricing); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/rental-pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pricing) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setNotice(pricing.tiers.length ? "บันทึกตารางราคาแล้ว หน้าร้านจะแสดงราคาใหม่ภายในไม่กี่นาที" : "ล้างตารางราคาแล้ว สินค้าที่ไม่มีราคาเฉพาะจะแสดง “สอบถามราคา”");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return <main className="admin-main rental-pricing-page">
    <header className="rental-pricing-header"><span className="rental-pricing-eyebrow">RENTAL PRICING</span><h1>ราคาเช่าตามจำนวนวัน</h1><p>ตารางราคามาตรฐานของร้าน ใช้กับทุกสินค้าที่ไม่ได้ตั้งราคาเฉพาะ{customCount ? ` (ตอนนี้มี ${customCount.toLocaleString("th-TH")} สินค้าที่ตั้งราคาเฉพาะไว้)` : ""} ตั้งราคาเฉพาะได้ที่หน้าจัดการสินค้า → แก้ไข</p></header>
    <div className="rental-pricing-layout">
      <form className="rental-pricing-card" onSubmit={save}>
        <h2>ราคาต่อชุด</h2>
        <PriceTiersEditor showExtra={false} rows={rows} extra={extra} onChange={(nextRows, nextExtra) => { setRows(nextRows); setExtra(nextExtra); }} />
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
        <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกตารางราคา"}</Button></div>
      </form>
      <aside className="rental-pricing-side">
        <ExtraRates initial={rates} categories={categories} />
        <LateRatesForm initial={lateRates} />
        <section className="rental-pricing-card"><h2>ตัวอย่างราคาที่ลูกค้าเห็น</h2>{preview?.tiers.length ? <table><tbody>{[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14].map(days => { const price = priceFor(preview, days); return <tr key={days}><td>เช่า {days} วัน</td><td>{price == null ? "สอบถามร้าน" : `฿${price.toLocaleString("th-TH")}`}</td></tr>; })}</tbody></table> : <p>ยังไม่ได้ตั้งราคา หน้าร้านจะแสดง “สอบถามราคา”</p>}</section>
        {!!history.length && <section className="rental-pricing-card"><h2>อ้างอิงจากประวัติเช่าเดิม</h2><p>ราคาเฉลี่ยต่อชุดที่ลูกค้าเคยจ่าย (ไม่ได้ตั้งค่าให้อัตโนมัติ)</p><table><tbody>{history.map(row => <tr key={row.days}><td>{row.days} วัน <small>{row.count.toLocaleString("th-TH")} ครั้ง</small></td><td>~฿{row.average.toLocaleString("th-TH")}</td></tr>)}</tbody></table></section>}
      </aside>
    </div>
  </main>;
}
