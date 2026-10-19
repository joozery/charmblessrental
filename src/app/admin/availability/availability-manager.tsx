"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Product = { id: number; name: string; sku?: string };
export default function AvailabilityManager({ products, initialMonth }: { products: Product[]; initialMonth: string }) {
  const [productId, setProductId] = useState(products[0]?.id || 0);
  const [month, setMonth] = useState(initialMonth);
  const [days, setDays] = useState<Record<string, string>>({});
  const [loadedKey, setLoadedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const count = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;
  const key = `${productId}:${month}`;
  useEffect(() => {
    if (!productId || !month) return;
    const controller = new AbortController();
    fetch(`/api/admin/availability?productId=${productId}&month=${month}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "โหลดคิวไม่สำเร็จ"); return data.days as { date: string; remaining: number }[]; })
      .then(records => { setDays(Object.fromEntries(records.map(record => [record.date, String(record.remaining)]))); setLoadedKey(key); })
      .catch(cause => { if (cause.name !== "AbortError") { setError(cause instanceof Error ? cause.message : "โหลดคิวไม่สำเร็จ"); setLoadedKey(key); } });
    return () => controller.abort();
  }, [productId, month, key]);
  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const records = Array.from({ length: count }, (_, index) => { const date = `${month}-${String(index + 1).padStart(2, "0")}`; const value = days[date]; return { date, remaining: value === undefined || value === "" ? null : Number(value) }; });
      const response = await fetch("/api/admin/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, month, days: records }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "บันทึกคิวไม่สำเร็จ");
      setNotice("บันทึกคิวว่างเรียบร้อยแล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกคิวไม่สำเร็จ"); }
    finally { setSaving(false); }
  }
  const monthDays = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const currentProduct = products.find(product => product.id === productId);
  return <main className="admin-main availability-page">
    <header className="availability-header"><div><span className="availability-eyebrow">PRODUCT AVAILABILITY</span><h1>จัดการคิวว่าง</h1><p>กำหนดจำนวนชิ้นที่พร้อมให้เช่าในแต่ละวัน ปฏิทินบนหน้าสินค้าจะใช้ข้อมูลชุดนี้</p></div></header>
    {!products.length ? <section className="availability-card">ยังไม่มีสินค้าในระบบ</section> : <>
      <section className="availability-card availability-controls"><label>สินค้า<select value={productId} onChange={event => { setError(""); setNotice(""); setDays({}); setProductId(Number(event.target.value)); }}>{products.map(product => <option value={product.id} key={product.id}>{product.sku ? `${product.sku} · ` : ""}{product.name}</option>)}</select></label><label>เดือน<input type="month" value={month} onChange={event => { setError(""); setNotice(""); setDays({}); setMonth(event.target.value); }} /></label><p><strong>{currentProduct?.name}</strong><span>จำนวนว่างเป็นชิ้น · 0 หมายถึงเต็ม · เว้นว่างหมายถึงยังไม่มีข้อมูล</span></p></section>
      {notice && <p className="admin-success" role="status"><Icon name="success" />{notice}</p>}{error && <p className="admin-error" role="alert">{error}</p>}
      {loadedKey !== key ? <section className="availability-card" role="status">กำลังโหลดคิว…</section> : <section className="availability-card"><div className="availability-grid">{monthDays.map((date,index) => { const remaining = days[date]; return <label key={date} className={`availability-day ${remaining === "0" ? "is-full" : remaining ? "is-available" : "is-unknown"}`}><span>{index + 1}</span><small>{["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."][new Date(`${date}T12:00:00Z`).getUTCDay()]}</small><input aria-label={`${index + 1} จำนวนชิ้นที่ว่าง`} type="number" min="0" max="1000" step="1" placeholder="—" value={remaining ?? ""} onChange={event => setDays(current => ({ ...current, [date]: event.target.value }))} /></label>; })}</div><div className="availability-legend"><span><i className="is-available" />มีจำนวนว่าง</span><span><i className="is-full" />เต็ม</span><span><i className="is-unknown" />ยังไม่ระบุ</span></div></section>}
      <div className="availability-bottom"><Button onClick={save} disabled={saving || loadedKey !== key}><Icon name="check" />{saving ? "กำลังบันทึก…" : "บันทึกคิวว่าง"}</Button></div>
    </>}
  </main>;
}
