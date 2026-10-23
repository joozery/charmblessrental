"use client";

import { useState } from "react";
import { lateReturnLabels, type LateReturn } from "@/lib/extension";
import type { Permission } from "@/lib/permissions";
import { addDays, countUseDays } from "@/lib/schedule";
import type { FulfillmentRow } from "./booking-fulfillment";

const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function send(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/bookings/late", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

// "ส่งคืนล่าช้า": record the day the customer really sent the piece back; the fine is per piece per day past due.
export default function LateReturnPanel({ row, permissions, finePerDay, onChange }: { row: FulfillmentRow; permissions: Permission[]; finePerDay: number; onChange: (patch: Partial<FulfillmentRow>) => void }) {
  const canRecord = permissions.includes("shipping"), canPay = permissions.includes("payments");
  const late = row.lateReturn, due = late?.dueDate ?? row.schedule?.returnDate ?? "";
  const [form, setForm] = useState<{ actualDate: string; fine: string; note: string; touched: boolean } | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  if (!row.shipment || row.status !== "confirmed" || !due || (!late && today() <= due)) return null;

  const daysFor = (actual: string) => actual > due ? countUseDays(due, actual) - 1 : 0;
  const fineFor = (actual: string) => daysFor(actual) * finePerDay * row.items.length;
  const open = () => { const actual = late?.actualDate ?? (row.returned ? row.returned.at.slice(0, 10) : today()); setForm({ actualDate: actual, fine: String(late?.fine ?? fineFor(actual)), note: late?.note ?? "", touched: !!late }); setError(""); setNotice(""); };
  async function run(task: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); } }
  const save = () => run(async () => {
    if (!form) return;
    const data = await send({ id: row._id, action: "record", actualDate: form.actualDate, fine: Number(form.fine) || 0, note: form.note });
    onChange({ lateReturn: data.lateReturn as LateReturn, schedule: data.schedule }); setForm(null);
    setNotice(`บันทึกคืนล่าช้าแล้ว${data.lineNotified ? " และส่ง LINE แจ้งค่าปรับลูกค้าแล้ว" : ""}`);
  });
  const markPaid = () => run(async () => {
    const data = await send({ id: row._id, action: "paid", paidOn: paying });
    onChange({ lateReturn: data.lateReturn as LateReturn }); setPaying(null); setNotice("บันทึกรับค่าปรับแล้ว");
  });

  return <div className="bookings-late-return">
    {late ? <div className={`bookings-late-card is-${late.status}`}>
      <p><strong>ส่งคืนล่าช้า {late.days} วัน · ค่าปรับ {money(late.fine)} บาท</strong><b className={`bookings-extension-badge is-${late.status === "unpaid" ? "unpaid" : "paid"}`}>{lateReturnLabels[late.status]}</b></p>
      <small>กำหนดคืน {day(late.dueDate)} · คืนจริง {day(late.actualDate)} · บันทึกโดย {late.createdByName}{late.paidOn ? ` · ชำระ ${day(late.paidOn)}` : ""}</small>
      {late.note && <small>หมายเหตุ: {late.note}</small>}
      {late.status === "unpaid" && <span className="bookings-extension-actions">
        {canPay && (paying !== null ? <><input type="date" value={paying} max={today()} onChange={event => setPaying(event.target.value)} aria-label="วันที่รับค่าปรับ" /><button type="button" disabled={busy} onClick={() => setPaying(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || !paying} onClick={markPaid}>ยืนยันรับค่าปรับ</button></> : <button type="button" className="is-primary" disabled={busy} onClick={() => setPaying(today())}>ยืนยันรับค่าปรับ (ลูกค้าโอน)</button>)}
        {canRecord && paying === null && !form && <button type="button" disabled={busy} onClick={open}>แก้ไข</button>}
      </span>}
      {late.status === "unpaid" && row.deposit?.status === "held" && <small>หรือหักจากเงินมัดจำตอน &quot;ยืนยันโอนเงินมัดจำคืน&quot; ระบบจะเติมยอดหักให้</small>}
    </div>
      : canRecord && !form && <p className="bookings-fulfillment-wait is-late">เลยกำหนดคืน {day(due)} แล้ว<button type="button" className="is-danger" disabled={busy} onClick={open}>ส่งคืนล่าช้า</button></p>}
    {form && <div className="bookings-inline-form">
      <label>วันที่คืนจริง<input type="date" min={addDays(due, 1)} max={today()} value={form.actualDate} onChange={event => { const actualDate = event.target.value; setForm({ ...form, actualDate, fine: form.touched ? form.fine : String(fineFor(actualDate)) }); }} /></label>
      <label>ค่าปรับ (บาท)<input type="number" min="0" step="1" value={form.fine} onChange={event => setForm({ ...form, fine: event.target.value, touched: true })} /></label>
      <p className="is-wide bookings-extension-rule">ช้า {daysFor(form.actualDate)} วัน × วันละ {money(finePerDay)} บาท × {row.items.length} ชุด = {money(fineFor(form.actualDate))} บาท · กำหนดคืน {day(due)} · คิวถัดไปจะเลื่อนตามวันคืนจริง</p>
      <label className="is-wide">หมายเหตุ (ไม่บังคับ)<input value={form.note} maxLength={500} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="เช่น เครื่องบินดีเลย์" /></label>
      <div><button type="button" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || !form.actualDate || form.actualDate <= due || form.fine.trim() === ""} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกคืนล่าช้าและแจ้งค่าปรับ"}</button></div>
    </div>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && !error && <p className="admin-success" role="status">{notice}</p>}
  </div>;
}
