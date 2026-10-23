"use client";

import { useState } from "react";

type Coupon = { _id: string; code: string; label: string; percent: number; active: boolean; startsAt?: string; endsAt?: string; maxUses?: number | null; usedCount: number };
type FormState = { code: string; label: string; percent: string; startsAt: string; endsAt: string; maxUses: string; active: boolean };
const emptyForm: FormState = { code: "", label: "", percent: "", startsAt: "", endsAt: "", maxUses: "", active: true };
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "ไม่กำหนด";

export default function DiscountsManager({ initial }: { initial: Coupon[] }) {
  const [rows, setRows] = useState(initial), [form, setForm] = useState<FormState>(emptyForm), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const update = (key: keyof FormState, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const response = await fetch("/api/admin/discounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, percent: Number(form.percent), maxUses: form.maxUses ? Number(form.maxUses) : null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setRows(current => [data.coupon, ...current.filter(row => row._id !== data.coupon._id)]); setForm(emptyForm);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }
  return <main className="admin-main discounts-page">
    <header className="admin-page-title"><div><p className="admin-eyebrow">DISCOUNTS</p><h1>ส่วนลดและโค้ดส่วนลด</h1><p>สร้างโค้ดให้แอดมินนำไปใช้ตอนจัดทำบิล</p></div></header>
    <section className="admin-catalog discounts-card">
      <div className="discounts-card-heading"><div><h2>สร้างโค้ดส่วนลด</h2><p>กำหนดส่วนลดและเงื่อนไขการใช้งานในครั้งเดียว</p></div><span className="discounts-hint">ใช้กับบิลใหม่</span></div>
      <form onSubmit={save} className="discount-form">
        <label className="discount-field"><span>โค้ดส่วนลด</span><input required value={form.code} onChange={event => update("code", event.target.value.toUpperCase())} placeholder="WELCOME10" autoCapitalize="characters" /></label>
        <label className="discount-field discount-field-label"><span>ชื่อหรือรายละเอียด</span><input required value={form.label} onChange={event => update("label", event.target.value)} placeholder="ส่วนลดลูกค้าใหม่" /></label>
        <label className="discount-field"><span>ลด (%)</span><input required type="number" min="0.01" max="100" step="0.01" value={form.percent} onChange={event => update("percent", event.target.value)} placeholder="10" /></label>
        <label className="discount-field"><span>ใช้ได้สูงสุด (ครั้ง)</span><input type="number" min="1" value={form.maxUses} onChange={event => update("maxUses", event.target.value)} placeholder="ไม่จำกัด" /></label>
        <label className="discount-field"><span>เริ่มใช้</span><input type="date" value={form.startsAt} onChange={event => update("startsAt", event.target.value)} /></label>
        <label className="discount-field"><span>หมดอายุ</span><input type="date" min={form.startsAt || undefined} value={form.endsAt} onChange={event => update("endsAt", event.target.value)} /></label>
        <label className="discount-active"><input type="checkbox" checked={form.active} onChange={event => update("active", event.target.checked)} /><span><strong>เปิดใช้โค้ดทันที</strong><small>ปิดได้ภายหลังโดยไม่ต้องลบข้อมูล</small></span></label>
        <div className="discount-form-actions"><button className="admin-primary" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกโค้ด"}</button></div>
      </form>
      {error && <p className="admin-error">{error}</p>}
    </section>
    <section className="admin-catalog discounts-card">
      <div className="discounts-card-heading"><div><h2>โค้ดที่มีอยู่</h2><p>ตรวจสอบสถานะและจำนวนการใช้งานของแต่ละโค้ด</p></div><span className="discount-count">{rows.length} โค้ด</span></div>
      {rows.length ? <div className="discount-list">{rows.map(row => <article key={row._id} className="discount-item"><div className="discount-item-main"><strong>{row.code}</strong><span>{row.label}</span></div><div className="discount-item-value"><strong>ลด {row.percent}%</strong><small>ใช้แล้ว {row.usedCount}{row.maxUses ? ` / ${row.maxUses}` : " ครั้ง"}</small></div><div className="discount-item-meta"><span className={row.active ? "discount-status is-active" : "discount-status"}>{row.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span><small>{dateLabel(row.startsAt)} – {dateLabel(row.endsAt)}</small></div></article>)}</div> : <p className="admin-empty">ยังไม่มีโค้ดส่วนลด</p>}
    </section>
  </main>;
}
