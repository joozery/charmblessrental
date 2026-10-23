"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import PriceTiersEditor, { pricingFrom, rowsFrom } from "@/components/price-tiers-editor";
import { priceFor, type CategoryDeposits, type ExtraDayRates, type RentalPricing } from "@/lib/pricing";
import type { LateRates } from "@/lib/extension";

type History = { days: number; count: number; average: number };
// Deposit per category; a product's own deposit (จัดการสินค้า) wins over it.
function CategoryDepositsForm({ initial = {}, categories }: { initial?: CategoryDeposits; categories: string[] }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries([...new Set([...categories, ...Object.keys(initial)])].map(category => [category, initial[category] === undefined ? "" : String(initial[category])])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const filled = Object.entries(values).filter(([, value]) => value.trim() !== "");
    if (filled.some(([, value]) => !(Number(value) >= 0))) { setError("เงินมัดจำต้องเป็นตัวเลขตั้งแต่ 0"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/rental-pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deposits", deposits: Object.fromEntries(filled.map(([category, value]) => [category, Number(value)])) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setNotice("บันทึกแล้ว ใช้กับคำขอที่ทำใบสรุปหลังจากนี้");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return <form className="rental-pricing-card delivery-form" onSubmit={save}>
    <h2>เงินมัดจำตามหมวด</h2>
    <p>ใบสรุปรวมมัดจำของสินค้าทุกชิ้นในคำขอ สินค้าที่ตั้งมัดจำเองในหน้าจัดการสินค้าจะใช้ยอดของสินค้านั้น ที่เหลือใช้ยอดของหมวด เว้นว่าง = ไม่เก็บมัดจำ</p>
    {Object.keys(values).map(category => <label key={category}>{category} (บาทต่อชิ้น)<input type="number" min="0" step="1" value={values[category]} placeholder="ไม่เก็บมัดจำ" onChange={event => setValues({ ...values, [category]: event.target.value })} /></label>)}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกเงินมัดจำ"}</Button></div>
  </form>;
}
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

export default function RentalPricingSettings({ initial, history, customCount, rates, lateRates, categoryDeposits, categories }: { initial: RentalPricing; history: History[]; customCount: number; rates: ExtraDayRates; lateRates: LateRates; categoryDeposits: CategoryDeposits; categories: string[] }) {
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

  const [tab, setTab] = useState<"days" | "extra" | "late" | "deposit">("days");
  const tiers = preview?.tiers.length ? [...preview.tiers].sort((a, b) => a.days - b.days) : [];
  const longest = tiers[tiers.length - 1], between = tiers.find((tier, index) => index > 0 && tier.days - tiers[index - 1].days > 1);
  const baht = (value: number) => `${value.toLocaleString("th-TH")} บาท`;
  const tabs = [
    { key: "days" as const, label: "ราคาตามจำนวนวัน", hint: "ราคาหลักของร้าน" },
    { key: "extra" as const, label: "เช่าเกินแพ็กเกจ", hint: "วันที่เกินแพ็กเกจยาวสุด" },
    { key: "late" as const, label: "เช่าต่อ / คืนช้า", hint: "หลังส่งชุดถึงลูกค้า" },
    { key: "deposit" as const, label: "เงินมัดจำ", hint: "ตามหมวดสินค้า" },
  ];

  return <main className="admin-main rental-pricing-page">
    <header className="rental-pricing-header"><span className="rental-pricing-eyebrow">RENTAL PRICING</span><h1>ราคาเช่า</h1><p>สูตรคิดเงินทั้งหมดของร้าน ใช้ทั้งตอนลูกค้าจองหน้าร้าน และตอนทำใบสรุปก่อนชำระเงิน เลือกหัวข้อด้านล่างเพื่อตั้งค่า</p></header>
    <nav className="pricing-tabs" role="tablist" aria-label="หัวข้อราคาเช่า">{tabs.map((item, index) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)}><b>{index + 1}</b><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</nav>

    <section role="tabpanel" hidden={tab !== "days"} className="pricing-panel">
      <div className="pricing-explain"><h2>ราคาตามจำนวนวัน</h2><p>ราคาต่อชุดตามจำนวนวันที่ลูกค้าเช่า ใช้กับทุกสินค้าที่ไม่ได้ตั้งราคาเฉพาะ{customCount ? ` (ตอนนี้มี ${customCount.toLocaleString("th-TH")} ชิ้นที่ตั้งราคาเฉพาะไว้ ในหน้าจัดการสินค้า)` : ""}</p>
        <ul>{between ? <li>เช่า {between.days - 1} วัน (ไม่มีแพ็กเกจนี้) → คิดราคาแพ็กเกจที่สูงกว่าถัดไป คือ {between.days} วัน = <b>{baht(between.price)}</b></li> : <li>จำนวนวันที่ไม่มีในตาราง จะคิดราคาแพ็กเกจที่สูงกว่าถัดไป</li>}<li>เช่าเกิน {longest ? `${longest.days} วัน` : "แพ็กเกจยาวสุด"} → ไปตั้งที่แท็บ &quot;เช่าเกินแพ็กเกจ&quot;</li></ul></div>
      <div className="rental-pricing-layout">
        <form className="rental-pricing-card" onSubmit={save}>
          <h2>ตารางราคาต่อชุด</h2>
          <PriceTiersEditor showExtra={false} rows={rows} extra={extra} onChange={(nextRows, nextExtra) => { setRows(nextRows); setExtra(nextExtra); }} />
          {error && <p className="admin-error" role="alert">{error}</p>}
          {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
          <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกตารางราคา"}</Button></div>
        </form>
        <aside className="rental-pricing-side">
          <section className="rental-pricing-card"><h2>ราคาที่ลูกค้าจะเห็น</h2>{preview?.tiers.length ? <table><tbody>{[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14].map(days => { const price = priceFor(preview, days); return <tr key={days}><td>เช่า {days} วัน</td><td>{price == null ? "สอบถามร้าน" : `฿${price.toLocaleString("th-TH")}`}</td></tr>; })}</tbody></table> : <p>ยังไม่ได้ตั้งราคา หน้าร้านจะแสดง “สอบถามราคา”</p>}</section>
          {!!history.length && <section className="rental-pricing-card"><h2>อ้างอิงจากประวัติเช่าเดิม</h2><p>ราคาเฉลี่ยต่อชุดที่ลูกค้าเคยจ่าย (ไว้ดูประกอบ ไม่ได้ตั้งค่าให้)</p><table><tbody>{history.map(row => <tr key={row.days}><td>{row.days} วัน <small>{row.count.toLocaleString("th-TH")} ครั้ง</small></td><td>~฿{row.average.toLocaleString("th-TH")}</td></tr>)}</tbody></table></section>}
        </aside>
      </div>
    </section>

    <section role="tabpanel" hidden={tab !== "extra"} className="pricing-panel">
      <div className="pricing-explain"><h2>เช่าเกินแพ็กเกจ</h2><p>เมื่อลูกค้าเช่านานกว่าแพ็กเกจที่ยาวที่สุด ระบบคิดราคาแพ็กเกจยาวสุด แล้วบวกเพิ่มรายวันตามค่าที่ตั้งตรงนี้</p>
        <ul><li>{longest && rates.perDay != null ? <>ตัวอย่าง: เช่า {longest.days + 4} วัน = ราคา {longest.days} วัน {baht(longest.price)} + 4 วัน × {baht(rates.perDay)} = <b>{baht(longest.price + 4 * rates.perDay)}</b></> : "ตัวอย่างจะแสดงเมื่อตั้งตารางราคาและค่าส่วนเกินแล้ว"}</li><li>ตั้งราคาแยกให้บางหมวดได้ เช่น กล้องวันละ 100</li></ul></div>
      <div className="pricing-single"><ExtraRates initial={rates} categories={categories} /></div>
    </section>

    <section role="tabpanel" hidden={tab !== "late"} className="pricing-panel">
      <div className="pricing-explain"><h2>เช่าต่อ / คืนช้า</h2><p>ใช้ในหน้าคำขอจอง ตอนกด &quot;ขยายวันเช่า&quot; และ &quot;ส่งคืนล่าช้า&quot; ระบบเติมยอดให้ แอดมินแก้ได้ก่อนยืนยัน</p>
        <ul><li><b>ยังไม่ส่งชุด</b> แล้วขอเพิ่มวัน → คิดตามตารางราคา (ราคาวันใหม่ − ราคาเดิม)</li><li><b>ส่งชุดแล้ว</b> แล้วขอเช่าต่อ → ตัวอย่าง 2 วัน × 1 ชุด × {baht(lateRates.afterShipPerDay)} = <b>{baht(2 * lateRates.afterShipPerDay)}</b></li><li><b>คืนช้า</b> โดยไม่ได้แจ้งขอเช่าต่อ → ตัวอย่าง ช้า 1 วัน × 2 ชุด × {baht(lateRates.lateFinePerDay)} = <b>{baht(2 * lateRates.lateFinePerDay)}</b></li></ul></div>
      <div className="pricing-single"><LateRatesForm initial={lateRates} /></div>
    </section>

    <section role="tabpanel" hidden={tab !== "deposit"} className="pricing-panel">
      <div className="pricing-explain"><h2>เงินมัดจำ</h2><p>ใบสรุปก่อนชำระเงินรวมมัดจำของสินค้าทุกชิ้นในคำขอให้อัตโนมัติ เลือกยอดของแต่ละชิ้นตามลำดับนี้</p>
        <ol><li>มัดจำที่ตั้งไว้ที่<b>ตัวสินค้า</b> (หน้าจัดการสินค้า → แก้ไข) ตั้ง 0 = ชิ้นนั้นไม่เก็บมัดจำ</li><li>ถ้าสินค้าไม่ได้ตั้ง ใช้ยอดของ<b>หมวด</b>ด้านล่าง</li><li>ถ้าหมวดก็ไม่ได้ตั้ง ไม่เก็บมัดจำ · ลูกค้าที่ยืนยันตัวตนแทนมัดจำไม่ต้องจ่ายเสมอ</li></ol></div>
      <div className="pricing-single"><CategoryDepositsForm initial={categoryDeposits} categories={categories} /></div>
    </section>
  </main>;
}
