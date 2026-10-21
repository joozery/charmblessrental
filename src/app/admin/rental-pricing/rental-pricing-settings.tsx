"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import PriceTiersEditor, { pricingFrom, rowsFrom } from "@/components/price-tiers-editor";
import { priceFor, type RentalPricing } from "@/lib/pricing";

type History = { days: number; count: number; average: number };
export default function RentalPricingSettings({ initial, history, customCount }: { initial: RentalPricing; history: History[]; customCount: number }) {
  const [rows, setRows] = useState(rowsFrom(initial));
  const [extra, setExtra] = useState(initial.extraPerDay == null ? "" : String(initial.extraPerDay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pricing = pricingFrom(rows, extra);
  const preview = typeof pricing === "string" ? null : pricing;

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
        <PriceTiersEditor rows={rows} extra={extra} onChange={(nextRows, nextExtra) => { setRows(nextRows); setExtra(nextExtra); }} />
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
        <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกตารางราคา"}</Button></div>
      </form>
      <aside className="rental-pricing-side">
        <section className="rental-pricing-card"><h2>ตัวอย่างราคาที่ลูกค้าเห็น</h2>{preview?.tiers.length ? <table><tbody>{[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14].map(days => { const price = priceFor(preview, days); return <tr key={days}><td>เช่า {days} วัน</td><td>{price == null ? "สอบถามร้าน" : `฿${price.toLocaleString("th-TH")}`}</td></tr>; })}</tbody></table> : <p>ยังไม่ได้ตั้งราคา หน้าร้านจะแสดง “สอบถามราคา”</p>}</section>
        {!!history.length && <section className="rental-pricing-card"><h2>อ้างอิงจากประวัติเช่าเดิม</h2><p>ราคาเฉลี่ยต่อชุดที่ลูกค้าเคยจ่าย (ไม่ได้ตั้งค่าให้อัตโนมัติ)</p><table><tbody>{history.map(row => <tr key={row.days}><td>{row.days} วัน <small>{row.count.toLocaleString("th-TH")} ครั้ง</small></td><td>~฿{row.average.toLocaleString("th-TH")}</td></tr>)}</tbody></table></section>}
      </aside>
    </div>
  </main>;
}
