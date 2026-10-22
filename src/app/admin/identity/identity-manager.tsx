"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { verificationLabels, type VerificationSettings, type VerificationStatus } from "@/lib/identity";

export type QueueRow = { id: string; name: string; phone: string; ship: string; status: VerificationStatus };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const order: VerificationStatus[] = ["submitted", "rejected", "pending", "approved"];

export default function IdentityManager({ queue, initial, categories, canEditSettings }: { queue: QueueRow[]; initial: VerificationSettings; categories: string[]; canEditSettings: boolean }) {
  const [form, setForm] = useState({ ...initial, maxRental: initial.maxRental == null ? "" : String(initial.maxRental) });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const settings = { ...form, maxRental: form.maxRental.trim() === "" ? null : Number(form.maxRental) };
      const response = await fetch("/api/admin/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", settings }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setNotice("บันทึกแล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  const sorted = [...queue].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.ship.localeCompare(b.ship));
  return <main className="admin-main rental-pricing-page">
    <header className="rental-pricing-header"><span className="rental-pricing-eyebrow">IDENTITY</span><h1>ยืนยันตัวตนแทนเงินประกัน</h1><p>ลูกค้าที่เลือกไม่วางเงินประกันต้องส่งรูปบัตรประชาชน เซลฟี่คู่บัตร และที่อยู่ ผ่านลิงก์บิล ร้านตรวจแล้วจึงจัดส่งได้ รูปเก็บแยกจากรูปสินค้า เปิดดูได้เฉพาะบัญชีที่มีสิทธิ์ และทุกการเปิดดูถูกบันทึก</p></header>
    <div className="rental-pricing-layout">
      <section className="rental-pricing-card"><h2>คำขอที่ไม่วางเงินประกัน ({queue.length})</h2>
        {sorted.length ? <table><tbody>{sorted.map(row => <tr key={row.id}><td><Link href={`/admin/bookings?id=${encodeURIComponent(row.id)}`}>{row.id}</Link><small> {row.name} · {row.phone}</small></td><td><span className={`bookings-identity-status is-${row.status}`}>{verificationLabels[row.status]}</span><small> ส่ง {day(row.ship)}</small></td></tr>)}</tbody></table> : <p>ยังไม่มีคำขอที่เลือกยืนยันตัวตน</p>}
      </section>
      <form className="rental-pricing-card delivery-form" onSubmit={save}>
        <h2>ตั้งค่า</h2>
        <fieldset disabled={!canEditSettings} className="delivery-form">
          <label className="delivery-check"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />เปิดให้ลูกค้าเลือกไม่วางเงินประกัน</label>
          <label>ใช้ได้เมื่อค่าเช่าไม่เกิน (บาท)<input type="number" min="0" step="1" value={form.maxRental} placeholder="ไม่จำกัด" onChange={event => setForm({ ...form, maxRental: event.target.value })} /></label>
          <div><span className="delivery-help">หมวดที่ต้องวางเงินประกันเสมอ</span><div className="identity-categories">{categories.map(category => <label key={category} className="delivery-check"><input type="checkbox" checked={form.excludedCategories.includes(category)} onChange={event => setForm({ ...form, excludedCategories: event.target.checked ? [...form.excludedCategories, category] : form.excludedCategories.filter(item => item !== category) })} />{category}</label>)}</div></div>
          <label>ลูกค้าเคยยืนยันแล้ว ใช้ต่อได้ (เดือน)<input type="number" min="0" max="36" step="1" value={form.validMonths} onChange={event => setForm({ ...form, validMonths: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label>
          <label>ลบรูปเอกสารหลังจบการเช่า (วัน)<input type="number" min="1" max="365" step="1" value={form.deleteAfterDays} onChange={event => setForm({ ...form, deleteAfterDays: Math.max(1, Math.round(Number(event.target.value) || 1)) })} /></label>
          <label>ข้อความในฟอร์มจอง<textarea rows={3} maxLength={500} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
        </fieldset>
        {!canEditSettings && <p className="delivery-help">ต้องมีสิทธิ์ “ตั้งค่าร้าน” จึงจะแก้การตั้งค่าได้</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
        {canEditSettings && <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Button></div>}
      </form>
    </div>
  </main>;
}
