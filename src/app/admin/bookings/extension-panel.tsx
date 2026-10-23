"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { activeExtensions, extensionLabels, lastUseDay, type Extension } from "@/lib/extension";
import type { Permission } from "@/lib/permissions";
import { addDays, type ScheduleRecord } from "@/lib/schedule";
import type { FulfillmentRow } from "./booking-fulfillment";
import QueueCalendar from "./queue-calendar";

type Preview = { toEnd: string; added: number; schedule: ScheduleRecord; conflicts: { item: string; date: string; bookings: { id: string; name: string }[] }[]; suggested: number | null; rule: string };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function send(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/bookings/extension", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

// Each piece's queue at a glance, and renting the same pieces for more days with a second payment on the same bill.
export default function ExtensionPanel({ row, permissions, onChange }: { row: FulfillmentRow; permissions: Permission[]; onChange: (patch: Partial<FulfillmentRow>) => void }) {
  const canExtend = permissions.includes("bookings"), canPay = permissions.includes("payments");
  const [calendar, setCalendar] = useState<{ id: number; label: string } | null>(null);
  const [form, setForm] = useState<{ toEnd: string; amount: string; touched: boolean; note: string; allowClash: boolean } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [paying, setPaying] = useState<{ id: string; day: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const end = lastUseDay(row), extensions = row.extensions || [], latest = activeExtensions(extensions).at(-1);
  const canStart = row.status === "confirmed" && !row.returned && !!row.schedule && !extensions.some(item => item.status === "unpaid");
  const items = row.items.filter((item, index) => row.items.findIndex(other => other.id === item.id) === index);

  async function run(task: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); } }
  const choose = (toEnd: string) => {
    if (!form) return;
    setForm({ ...form, toEnd, allowClash: false }); setPreview(null);
    if (toEnd) void run(async () => {
      const data: Preview = await send({ id: row._id, action: "preview", toEnd });
      setPreview(data);
      setForm(current => current && current.toEnd === toEnd && !current.touched && data.suggested !== null ? { ...current, amount: String(data.suggested) } : current);
    });
  };
  const create = () => run(async () => {
    if (!form || !preview) return;
    const data = await send({ id: row._id, action: "create", toEnd: preview.toEnd, amount: Number(form.amount) || 0, note: form.note, allowClash: form.allowClash });
    onChange({ extensions: [...extensions, data.extension], schedule: data.schedule });
    setForm(null); setPreview(null);
    setNotice(`ขยายวันเช่าแล้ว${data.lineNotified ? " และส่ง LINE แจ้งลูกค้าแล้ว" : " · ไม่ได้ส่ง LINE (ลูกค้ายังไม่ได้เชื่อม LINE หรือส่งไม่สำเร็จ)"}`);
  });
  const update = (extension: Extension, patch: Partial<FulfillmentRow>) => onChange({ ...patch, extensions: extensions.map(item => item.id === extension.id ? extension : item) });
  const markPaid = () => run(async () => {
    if (!paying) return;
    const data = await send({ id: row._id, action: "paid", extensionId: paying.id, paidOn: paying.day });
    update(data.extension, {}); setPaying(null);
    setNotice(`บันทึกรับค่าเช่าต่อแล้ว${data.lineNotified ? " และส่ง LINE แจ้งลูกค้าแล้ว" : ""}`);
  });
  const cancel = (extension: Extension) => run(async () => {
    const data = await send({ id: row._id, action: "cancel", extensionId: extension.id });
    update(data.extension, { schedule: data.schedule }); setNotice("ยกเลิกการเช่าต่อแล้ว คิวที่กันเพิ่มว่างแล้ว");
  });

  return <div className="bookings-detail-section bookings-extension"><Icon name="calendar" /><div>
    <h3>คิวและการเช่าต่อ</h3>
    <p className="bookings-queue-links">ดูคิว:{items.map(item => <button key={item.id} type="button" onClick={() => setCalendar({ id: item.id, label: item.sku || item.name })}><Icon name="calendar" />{item.sku || item.name}</button>)}</p>
    {extensions.length > 0 && <ul className="bookings-extension-list">{extensions.map(item => <li key={item.id} className={`is-${item.status}`}>
      <span><strong>+{item.addedDays} วัน · ใช้งานถึง {day(item.toEnd)}</strong><small>{item.lateDays ? `ค่าปรับล่าช้า ${money(item.amount)} บาท (${item.lateDays} วัน × 100)` : `ค่าเช่าต่อ ${money(item.amount)} บาท`} · {item.createdByName}{item.paidOn ? ` · ชำระ ${day(item.paidOn)}` : item.dueAt ? " · ต้องชำระภายใน 1 ชั่วโมง" : ""}</small>{item.billToken && item.status === "unpaid" && <small><a href={`/bill/${item.billToken}`} target="_blank" rel="noopener noreferrer">เปิดบิลเพิ่มเติม</a></small>}{item.note && <small className="bookings-extension-note">หมายเหตุ: {item.note}</small>}{item.clashDates?.length ? <small className="bookings-clash-text">ขยายทับคิวคนอื่น {item.clashDates.map(day).join(", ")}</small> : null}</span>
      <b className={`bookings-extension-badge is-${item.status}`}>{extensionLabels[item.status]}</b>
      {item.status === "unpaid" && <span className="bookings-extension-actions">
        {canPay && (paying?.id === item.id ? <><input type="date" value={paying.day} max={today()} onChange={event => setPaying({ ...paying, day: event.target.value })} aria-label="วันที่ชำระ" /><button type="button" disabled={busy} onClick={() => setPaying(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || !paying.day} onClick={markPaid}>ยืนยันรับเงิน</button></>
          : <button type="button" className="is-primary" disabled={busy} onClick={() => setPaying({ id: item.id, day: today() })}>ยืนยันรับเงินค่าเช่าต่อ</button>)}
        {canExtend && latest?.id === item.id && !row.returned && paying?.id !== item.id && <button type="button" disabled={busy} onClick={() => cancel(item)}>ยกเลิกการเช่าต่อ</button>}
      </span>}
    </li>)}</ul>}
    {canExtend && canStart && !form && <p className="bookings-fulfillment-wait">ใช้งานถึง {day(end)} · คืนภายใน {day(row.schedule!.returnDate)}<button type="button" disabled={busy} onClick={() => { setForm({ toEnd: "", amount: "", touched: false, note: "", allowClash: false }); setPreview(null); setNotice(""); }}>ขยายวันเช่า</button></p>}
    {form && <div className="bookings-inline-form">
      <label>ใช้งานถึงวันที่ (เดิม {day(end)})<input type="date" min={addDays(end, 1)} value={form.toEnd} onChange={event => choose(event.target.value)} /></label>
      <label>ค่าเช่าต่อ (บาท)<input type="number" min="0" step="1" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value, touched: true })} placeholder={preview?.suggested === null ? "ไม่มีราคาตั้งไว้ กรอกเอง" : ""} /></label>
      {preview && <div className="is-wide bookings-extension-preview">
        <p>+{preview.added} วัน · ลูกค้าคืนชุดภายใน <b>{day(preview.schedule.returnDate)}</b> · รับคิวใหม่ได้ {day(preview.schedule.ready)}{preview.suggested !== null && <> · ราคาแนะนำ {money(preview.suggested)} บาท</>}</p><p className="bookings-extension-rule">{preview.rule}</p>
        {preview.conflicts.length ? <div className="bookings-clash">
          <strong>⚠️ คิวซ้อนกับลูกค้าคนอื่น</strong>
          {preview.conflicts.map(clash => <p key={`${clash.item}-${clash.date}`}>{day(clash.date)} · {clash.item}{clash.bookings.map(other => <Link key={other.id} href={`/admin/bookings?id=${encodeURIComponent(other.id)}`}> {other.name || other.id} ({other.id})</Link>)}</p>)}
          <label><input type="checkbox" checked={form.allowClash} onChange={event => setForm({ ...form, allowClash: event.target.checked })} />ยืนยันขยายวันแม้คิวซ้อน ร้านจะติดต่อจัดการคิวลูกค้าคนต่อไปเอง (สลับชุด / เลื่อนวัน)</label>
        </div>
          : <p className="is-free"><Icon name="success" />คิวว่าง ขยายวันได้</p>}
      </div>}
      <label className="is-wide">หมายเหตุ{preview?.conflicts.length ? " (จำเป็นเมื่อคิวซ้อน)" : " (ไม่บังคับ)"}<input value={form.note} maxLength={500} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="เช่น เครื่องบินดีเลย์ ลูกค้าคืนชุดวันที่ 23" /></label>
      <div><button type="button" disabled={busy} onClick={() => { setForm(null); setPreview(null); }}>ยกเลิก</button>{items[0] && <button type="button" disabled={!preview} onClick={() => setCalendar({ id: items[0].id, label: items[0].sku || items[0].name })}>ดูในปฏิทิน</button>}<button type="button" className="is-primary" disabled={busy || !preview || preview.toEnd !== form.toEnd || (preview.conflicts.length > 0 && (!form.allowClash || !form.note.trim())) || form.amount.trim() === ""} onClick={create}>{busy ? "กำลังตรวจ…" : "ยืนยันขยายวันและแจ้งลูกค้า"}</button></div>
    </div>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && !error && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    {calendar && <QueueCalendar productId={calendar.id} label={calendar.label} highlight={row._id} preview={preview && row.schedule ? { from: row.schedule.ready, to: preview.schedule.ready } : null} startMonth={preview?.toEnd || end} onClose={() => setCalendar(null)} />}
  </div></div>;
}
