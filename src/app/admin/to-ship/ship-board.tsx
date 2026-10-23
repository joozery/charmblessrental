"use client";

import Link from "next/link";
import { useState } from "react";

export type ShipRow = {
  id: string; name: string; phone: string; address: string; pickup: boolean; methodLabel: string;
  shipDay: string; start: string; returnDay: string; paidAt: string; identityPending: boolean;
  items: { name: string; sku: string; image: string; ready: boolean; state: string }[];
};
const carriers = ["ไปรษณีย์ไทย", "Flash Express", "Kerry Express", "J&T Express", "แมสเซนเจอร์", "Lalamove"];
const addDays = (day: string, by: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
const dayLabel = (day: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

// Paid bookings grouped by when they must leave: late, today, tomorrow, later. Sending one records the tracking
// number through the same action as the booking page, which also tells the customer on LINE.
export default function ShipBoard({ rows: initial, today }: { rows: ShipRow[]; today: string }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<{ id: string; carrier: string; trackingNumber: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState("");
  const tomorrow = addDays(today, 1);
  const groups = [
    { key: "late", title: "เลยวันที่ต้องส่งแล้ว", rows: rows.filter(row => row.shipDay < today) },
    { key: "today", title: "ต้องส่งวันนี้", rows: rows.filter(row => row.shipDay === today) },
    { key: "tomorrow", title: "ต้องส่งพรุ่งนี้", rows: rows.filter(row => row.shipDay === tomorrow) },
    { key: "later", title: "ส่งวันถัดไป", rows: rows.filter(row => row.shipDay > tomorrow) },
  ];

  async function ship(row: ShipRow) {
    if (!form) return;
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch("/api/admin/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action: "ship", carrier: row.pickup ? "" : form.carrier.trim(), trackingNumber: row.pickup ? "" : form.trackingNumber.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกการจัดส่งไม่สำเร็จ");
      setRows(current => current.filter(item => item.id !== row.id)); setForm(null);
      setDone(`${row.id} ${row.pickup ? "ส่งมอบแล้ว" : "บันทึกเลขพัสดุแล้ว"}${data.lineNotified ? " · แจ้งลูกค้าทาง LINE แล้ว" : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกการจัดส่งไม่สำเร็จ"); } finally { setBusy(false); }
  }

  return <>
    <section className="to-ship-summary" aria-label="สรุปรายการที่ต้องส่ง">{groups.map(group => <a key={group.key} href={`#${group.key}`} className={`is-${group.key}`}><span>{group.title}</span><strong>{group.rows.length}</strong></a>)}</section>
    {done && <p className="to-ship-done" role="status">✓ {done}</p>}
    {!rows.length && <p className="to-ship-empty">ไม่มีรายการที่ต้องส่ง ลูกค้าที่ชำระแล้วส่งครบทุกรายการ</p>}
    {groups.filter(group => group.rows.length).map(group => <section key={group.key} id={group.key} className={`to-ship-group is-${group.key}`}>
      <h2>{group.title} <small>{group.rows.length} รายการ</small></h2>
      {group.rows.map(row => <article key={row.id} className="to-ship-card">
        <div className="to-ship-when"><strong>{row.pickup ? "รับที่ร้าน" : "ส่ง"} {dayLabel(row.shipDay)}</strong><small>ใช้งาน {dayLabel(row.start)} · คืน {dayLabel(row.returnDay)}</small></div>
        <div className="to-ship-main">
          <p className="to-ship-title"><Link href={`/admin/bookings?id=${encodeURIComponent(row.id)}`}>{row.id}</Link> · {row.name} · <a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a></p>
          <p className="to-ship-method">{row.methodLabel}{!row.pickup && row.address ? ` · ${row.address}` : ""}</p>
          <ul className="to-ship-items">{row.items.map((item, index) => <li key={index} className={item.ready ? "" : "is-waiting"}>{item.image ? <img src={item.image} alt="" /> : <span />}<div><b>{item.sku}</b><small>{item.name}</small>{!item.ready && <em>{item.state || "ยังไม่พร้อม"}</em>}</div></li>)}</ul>
          {row.identityPending && <p className="to-ship-warn">⚠️ ลูกค้ายังยืนยันตัวตนไม่ผ่าน ต้องตรวจเอกสารก่อนจัดส่ง</p>}
          {row.items.some(item => !item.ready) && <p className="to-ship-warn">⚠️ มีชิ้นที่ยังไม่พร้อม ตรวจที่หน้าเตรียมสินค้าก่อนส่ง</p>}
          {form?.id === row.id
            ? <div className="to-ship-form">{!row.pickup && <><label>ขนส่ง<input list="to-ship-carriers" value={form.carrier} maxLength={60} onChange={event => setForm({ ...form, carrier: event.target.value })} /></label><label>เลขพัสดุ<input autoFocus value={form.trackingNumber} maxLength={60} onChange={event => setForm({ ...form, trackingNumber: event.target.value })} placeholder="เช่น TH123456789" /></label></>}<button type="button" className="is-primary" disabled={busy || (!row.pickup && !form.trackingNumber.trim())} onClick={() => void ship(row)}>{busy ? "กำลังบันทึก…" : row.pickup ? "ยืนยันส่งมอบที่ร้าน" : "บันทึกจัดส่ง"}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button></div>
            : <div className="to-ship-actions"><button type="button" className="is-primary" disabled={busy || row.identityPending} onClick={() => { setError(""); setForm({ id: row.id, carrier: carriers[0], trackingNumber: "" }); }}>{row.pickup ? "ส่งมอบที่ร้าน" : "บันทึกเลขพัสดุ"}</button><Link href={`/admin/bookings?id=${encodeURIComponent(row.id)}`}>ดูรายละเอียด</Link></div>}
          {error && form?.id === row.id && <p className="to-ship-error" role="alert">{error}</p>}
        </div>
      </article>)}
    </section>)}
    <datalist id="to-ship-carriers">{carriers.map(carrier => <option key={carrier} value={carrier} />)}</datalist>
  </>;
}
