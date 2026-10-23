"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { adjustmentLabels, type Adjustment } from "@/lib/adjustment";
import { activeExtensions } from "@/lib/extension";
import type { Permission } from "@/lib/permissions";
import { countUseDays, type ScheduleRecord } from "@/lib/schedule";
import type { FulfillmentItem, FulfillmentRow } from "./booking-fulfillment";

type Piece = { id: number; name: string; sku: string; image?: string };
type Preview = { days: number; schedule: ScheduleRecord; lines: (Piece & { rentalPrice: number | null; deposit: number })[]; conflicts: { item: string; date: string }[]; rental: number | null; deposit: number; current: number; tooSoon: boolean };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function send(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/bookings/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

// Move the dates, change the length, swap or add pieces, before the booking ships. The rent is worked out again by the
// shop's table; after payment the difference becomes its own charge or refund on the same bill.
export default function EditBookingPanel({ row, permissions, onChange }: { row: FulfillmentRow & { adjustments?: Adjustment[]; payment?: string }; permissions: Permission[]; onChange: (patch: Partial<FulfillmentRow> & { adjustments?: Adjustment[] }) => void }) {
  const canEdit = permissions.includes("pricing"), canSettle = permissions.includes("payments");
  const [form, setForm] = useState<{ start: string; end: string; pieces: Piece[]; rental: string; touched: boolean; note: string; allowClash: boolean } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [search, setSearch] = useState(""); const [found, setFound] = useState<Piece[]>([]);
  const [settling, setSettling] = useState<{ id: string; day: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const adjustments = row.adjustments || [];
  const editable = row.status !== "cancelled" && !row.shipment && !row.returned && !activeExtensions(row.extensions).length;

  async function run(task: () => Promise<void>) { setBusy(true); setError(""); try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); } }
  // Every change asks the server again: queue, schedule and the shop's price for the new length and pieces.
  const refresh = (next: NonNullable<typeof form>) => {
    setForm(next); setPreview(null);
    if (!next.start || !next.end || next.end < next.start || !next.pieces.length) return;
    void run(async () => {
      const data: Preview = await send({ action: "preview", id: row._id, start: next.start, end: next.end, itemIds: next.pieces.map(piece => piece.id) });
      setPreview(data);
      setForm(current => current && !current.touched && data.rental !== null ? { ...current, rental: String(data.rental) } : current);
    });
  };
  const open = () => { setNotice(""); setFound([]); setSearch(""); refresh({ start: row.start, end: row.end, pieces: row.items.map((item: FulfillmentItem) => ({ id: item.id, name: item.name, sku: item.sku })), rental: "", touched: false, note: "", allowClash: false }); };
  const find = () => run(async () => { const data = await send({ action: "search", q: search }); setFound(data.products); });
  const apply = () => run(async () => {
    if (!form || !preview) return;
    const data = await send({ action: "apply", id: row._id, start: form.start, end: form.end, itemIds: form.pieces.map(piece => piece.id), rental: Number(form.rental) || 0, note: form.note, allowClash: form.allowClash });
    onChange({ ...data.booking, ...(data.adjustment ? { adjustments: [...adjustments, data.adjustment] } : {}) });
    setForm(null); setPreview(null);
    setNotice(`บันทึกการแก้ไขแล้ว${data.adjustment ? ` · ${data.adjustment.amount > 0 ? "ลูกค้าต้องชำระเพิ่ม" : "ร้านต้องคืนเงิน"} ${money(Math.abs(data.adjustment.amount))} บาท` : ""}${data.lineNotified ? " · ส่ง LINE แจ้งลูกค้าแล้ว" : ""}`);
  });
  const settle = () => run(async () => {
    if (!settling) return;
    const data = await send({ action: "settle", id: row._id, adjustmentId: settling.id, settledOn: settling.day });
    onChange({ adjustments: adjustments.map(item => item.id === data.adjustment.id ? data.adjustment : item) }); setSettling(null); setNotice("บันทึกแล้ว");
  });

  const difference = preview && form ? Math.round(((Number(form.rental) || 0) - preview.current) * 100) / 100 : 0;
  const paid = row.payment === "paid";
  return <div className="bookings-detail-section bookings-edit"><Icon name="booking" /><div>
    <h3>แก้ไขการจอง</h3>
    {adjustments.length > 0 && <ul className="bookings-extension-list">{adjustments.map(item => <li key={item.id} className={`is-${item.status === "unpaid" || item.status === "refund" ? "unpaid" : "paid"}`}>
      <span><strong>{item.amount > 0 ? "เก็บเพิ่ม" : "คืนให้ลูกค้า"} {money(Math.abs(item.amount))} บาท</strong><small>{item.summary}</small>{item.note && <small className="bookings-extension-note">หมายเหตุ: {item.note}</small>}<small>{item.createdByName}{item.settledOn ? ` · ${day(item.settledOn)} โดย ${item.settledByName}` : ""}</small></span>
      <b className={`bookings-extension-badge is-${item.status === "unpaid" || item.status === "refund" ? "unpaid" : "paid"}`}>{adjustmentLabels[item.status]}</b>
      {(item.status === "unpaid" || item.status === "refund") && canSettle && <span className="bookings-extension-actions">{settling?.id === item.id ? <><input type="date" value={settling.day} max={today()} onChange={event => setSettling({ ...settling, day: event.target.value })} aria-label="วันที่" /><button type="button" disabled={busy} onClick={() => setSettling(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || !settling.day} onClick={settle}>ยืนยัน</button></> : <button type="button" className="is-primary" disabled={busy} onClick={() => setSettling({ id: item.id, day: today() })}>{item.status === "unpaid" ? "ยืนยันรับเงินส่วนต่าง" : "ยืนยันคืนเงินส่วนต่างแล้ว"}</button>}</span>}
    </li>)}</ul>}
    {!form && (editable ? canEdit && <p className="bookings-fulfillment-wait">เลื่อนวัน เพิ่ม/ลดวัน หรือเปลี่ยนชุด ได้จนกว่าจะส่งชุด<button type="button" disabled={busy} onClick={open}>แก้ไขการจอง</button></p>
      : <p className="bookings-fulfillment-meta">{row.shipment ? "ส่งชุดแล้ว ถ้าลูกค้าอยากใช้นานขึ้น ใช้ \"ขยายวันเช่า\"" : activeExtensions(row.extensions).length ? "มีการเช่าต่ออยู่ ยกเลิกการเช่าต่อก่อนจึงแก้ไขได้" : "แก้ไขไม่ได้"}</p>)}
    {form && <div className="bookings-inline-form">
      <label>วันเริ่มใช้งาน<input type="date" value={form.start} onChange={event => refresh({ ...form, start: event.target.value, end: form.end && form.end < event.target.value ? event.target.value : form.end })} /></label>
      <label>วันใช้งานวันสุดท้าย<input type="date" min={form.start} value={form.end} onChange={event => refresh({ ...form, end: event.target.value })} /></label>
      <p className="is-wide bookings-extension-rule">เดิม {day(row.start)} – {day(row.end)} ({countUseDays(row.start, row.end)} วัน) → ใหม่ {form.start && form.end >= form.start ? `${day(form.start)} – ${day(form.end)} (${countUseDays(form.start, form.end)} วัน)` : "—"}</p>
      <div className="is-wide bookings-edit-pieces"><span>ชุดในการจอง</span>
        {form.pieces.map((piece, index) => <div key={`${piece.id}-${index}`}><b>{piece.sku || piece.name}</b><small>{piece.name}</small>{preview?.lines[index] && <small>{preview.lines[index].rentalPrice === null ? "ไม่มีราคาตั้งไว้" : `${money(preview.lines[index].rentalPrice!)} บาท`}</small>}<button type="button" disabled={busy || form.pieces.length === 1} onClick={() => refresh({ ...form, pieces: form.pieces.filter((_, at) => at !== index) })}>ลบ</button></div>)}
        <div className="bookings-edit-search"><input value={search} placeholder="ค้นหารหัสหรือชื่อชุด เพื่อเพิ่มหรือเปลี่ยนชุด" onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); find(); } }} /><button type="button" disabled={busy || !search.trim()} onClick={find}>ค้นหา</button></div>
        {found.length > 0 && <div className="bookings-edit-found">{found.map(piece => <button key={piece.id} type="button" disabled={busy} onClick={() => { setFound([]); setSearch(""); refresh({ ...form, pieces: [...form.pieces, piece] }); }}><Icon name="plus" />{piece.sku || piece.name}<small>{piece.name}</small></button>)}</div>}
      </div>
      {preview && <div className="is-wide bookings-extension-preview">
        <p>ส่งชุด {day(preview.schedule.ship)} · คืนภายใน {day(preview.schedule.returnDate)} · รับคิวใหม่ได้ {day(preview.schedule.ready)}{preview.tooSoon ? <b className="bookings-clash-text"> · วันส่งชุดผ่านมาแล้ว ตรวจวันอีกครั้ง</b> : null}</p>
        <p>ค่าเช่าตามตารางร้าน: {preview.rental === null ? "บางชุดไม่มีราคาตั้งไว้ กรอกเอง" : <b>{money(preview.rental)} บาท</b>} · เงินมัดจำของชุดใหม่ {money(preview.deposit)} บาท</p>
        {preview.conflicts.length ? <div className="bookings-clash"><strong>⚠️ คิวซ้อนกับลูกค้าคนอื่น</strong><p>{[...new Set(preview.conflicts.map(clash => `${clash.item} วันที่ ${day(clash.date)}`))].slice(0, 8).join(" · ")}</p><Link href="/admin/calendar">ดูปฏิทินทุกชุด</Link><label><input type="checkbox" checked={form.allowClash} onChange={event => setForm({ ...form, allowClash: event.target.checked })} />ยืนยันแก้ไขแม้คิวซ้อน ร้านจะจัดการคิวที่ชนเอง</label></div> : <p className="is-free"><Icon name="success" />คิวว่าง แก้ไขได้</p>}
      </div>}
      <label>ค่าเช่าใหม่ (บาท)<input type="number" min="0" step="1" value={form.rental} onChange={event => setForm({ ...form, rental: event.target.value, touched: true })} /></label>
      <label>หมายเหตุ{preview?.conflicts.length ? " (จำเป็น)" : ""}<input value={form.note} maxLength={500} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="เช่น ลูกค้าขอเลื่อนงาน" /></label>
      {preview && <p className={`is-wide bookings-edit-diff${difference > 0 ? " is-more" : difference < 0 ? " is-less" : ""}`}>ค่าเช่าเดิม {money(preview.current)} บาท → ใหม่ {money(Number(form.rental) || 0)} บาท · {difference === 0 ? "ไม่มีส่วนต่าง" : difference > 0 ? `ลูกค้าต้องจ่ายเพิ่ม ${money(difference)} บาท` : `ร้านต้องคืน ${money(-difference)} บาท`}{paid ? (difference !== 0 ? " (บิลที่ชำระแล้วไม่เปลี่ยน ส่วนต่างจะแยกเป็นรายการให้ชำระ/คืนในลิงก์บิลเดิม)" : "") : " (ยังไม่ชำระ ใบสรุปจะอัปเดตเป็นยอดใหม่)"}</p>}
      <div><button type="button" disabled={busy} onClick={() => { setForm(null); setPreview(null); }}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || !preview || form.rental.trim() === "" || (preview.conflicts.length > 0 && (!form.allowClash || !form.note.trim()))} onClick={apply}>{busy ? "กำลังตรวจ…" : "บันทึกการแก้ไขและแจ้งลูกค้า"}</button></div>
    </div>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && !error && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
  </div></div>;
}
