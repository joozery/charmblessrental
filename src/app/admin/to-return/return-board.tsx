"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

export type ReturnRow = {
  id: string; legacy?: boolean; name: string; phone: string; pickup: boolean; returnDay: string; start: string;
  items: { name: string; sku: string; image: string }[];
  customerReturn: { carrier: string; trackingNumber: string; at: string } | null;
};
type Tab = "all" | "late" | "today" | "later";
const addDays = (day: string, by: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
const dayLabel = (day: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const bucketFor = (row: ReturnRow, today: string, tomorrow: string) => row.returnDay < today ? "late" : row.returnDay === today ? "today" : row.returnDay === tomorrow ? "today" : "later";

export default function ReturnBoard({ rows: initial, today }: { rows: ReturnRow[]; today: string }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<{ id: string; condition: "good" | "damaged" | "missing"; note: string } | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const tomorrow = addDays(today, 1);
  const bucket = (row: ReturnRow) => bucketFor(row, today, tomorrow);
  const counts = {
    all: rows.length,
    late: rows.filter(row => bucketFor(row, today, tomorrow) === "late").length,
    today: rows.filter(row => bucketFor(row, today, tomorrow) === "today").length,
    later: rows.filter(row => bucketFor(row, today, tomorrow) === "later").length,
  };
  const text = query.trim().toLowerCase();
  const visible = rows.filter(row => (tab === "all" || bucketFor(row, today, tomorrow) === tab) && (!text || `${row.id} ${row.name} ${row.phone} ${row.items.map(item => `${item.name} ${item.sku}`).join(" ")} ${row.customerReturn?.trackingNumber || ""}`.toLowerCase().includes(text)));
  async function receive(row: ReturnRow) {
    if (!form) return;
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch(row.legacy ? "/api/admin/rentals" : "/api/admin/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row.legacy ? { id: row.id, action: "return", condition: form.condition, note: form.note.trim() } : { id: row.id, action: "receiveReturn", condition: form.condition, note: form.note.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกรับคืนไม่สำเร็จ");
      setRows(current => current.filter(item => item.id !== row.id)); setForm(null);
      setDone(`${row.id} รับคืนแล้ว`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกรับคืนไม่สำเร็จ"); } finally { setBusy(false); }
  }
  const tabs: { key: Tab; label: string; tone: string }[] = [{ key: "all", label: "ทั้งหมด", tone: "blue" }, { key: "late", label: "เลยกำหนด", tone: "red" }, { key: "today", label: "ถึงกำหนดวันนี้/พรุ่งนี้", tone: "orange" }, { key: "later", label: "กำหนดภายหลัง", tone: "gray" }];
  return <>
    <div className="to-ship-toolbar"><label className="to-ship-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อลูกค้า เบอร์โทร เลขออเดอร์ หรือเลขพัสดุ" /></label><select value={tab} onChange={event => setTab(event.target.value as Tab)} aria-label="กรองสถานะ"><option value="all">สถานะการส่งคืน · ทั้งหมด</option><option value="late">เลยกำหนด</option><option value="today">ถึงกำหนดวันนี้/พรุ่งนี้</option><option value="later">กำหนดภายหลัง</option></select><button type="button" onClick={() => { setQuery(""); setTab("all"); }}>รีเซ็ต</button></div>
    <div className="to-ship-tabs" role="tablist" aria-label="กรองรายการส่งคืน">{tabs.map(item => <button type="button" role="tab" aria-selected={tab === item.key} className={`is-${item.tone} ${tab === item.key ? "is-active" : ""}`} key={item.key} onClick={() => setTab(item.key)}><span>{item.label}</span><b>{counts[item.key]}</b></button>)}</div>
    {done && <p className="to-ship-done" role="status">✓ {done}</p>}{error && !form && <p className="to-ship-error" role="alert">{error}</p>}
    {!visible.length && <p className="to-ship-empty">ไม่พบรายการที่ต้องส่งคืนตามตัวกรองนี้</p>}
    {!!visible.length && <div className="to-ship-table-wrap"><table className="to-ship-table"><thead><tr><th>กำหนดส่งคืน</th><th>เลขออเดอร์</th><th>ลูกค้า</th><th>สินค้า</th><th>ข้อมูลส่งคืน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{visible.map(row => { const kind = bucket(row); const open = form?.id === row.id; return <Fragment key={row.id}><tr className={`is-${kind}`}><td><strong>{row.pickup ? "รับคืนที่ร้าน" : dayLabel(row.returnDay)}</strong><small>ใช้งาน {dayLabel(row.start)}</small></td><td><Link href={`/admin/bookings?id=${encodeURIComponent(row.id)}`} className="to-ship-order">{row.id}</Link></td><td><strong>{row.name}</strong><a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a></td><td><div className="to-ship-product-list">{row.items.map((item, index) => <div className="to-ship-product-item" key={`${item.sku}-${index}`}><span className="to-ship-product-image">{item.image && <img src={item.image} alt="" />}</span><div><strong>{item.sku || "—"}</strong><small>{item.name}</small></div></div>)}</div></td><td>{row.customerReturn ? <><strong>{row.customerReturn.carrier}</strong><small>{row.customerReturn.trackingNumber || "แจ้งทาง LINE"}</small></> : <span>ยังไม่แจ้งเลขพัสดุ</span>}</td><td><span className={`to-ship-status is-${kind}`}>{kind === "late" ? "เลยกำหนด" : kind === "today" ? "ใกล้ถึงกำหนด" : "รอส่งคืน"}</span>{row.customerReturn && <small className="to-ship-status-note">ลูกค้าแจ้งแล้ว · รอร้านรับ</small>}</td><td><div className="to-ship-row-actions"><button type="button" className="to-ship-primary" disabled={busy} onClick={() => { setError(""); setForm({ id: row.id, condition: "good", note: "" }); }}>ยืนยันรับคืน</button><a href={`/admin/bookings?id=${encodeURIComponent(row.id)}`}>รายละเอียด</a></div></td></tr>{open && <tr className="to-ship-form-row"><td colSpan={7}><div className="to-ship-form"><label>สภาพสินค้า<select value={form.condition} onChange={event => setForm({ ...form, condition: event.target.value as "good" | "damaged" | "missing" })}><option value="good">ปกติ</option><option value="damaged">ชำรุด</option><option value="missing">สูญหาย/ไม่ครบ</option></select></label><label>หมายเหตุ<input autoFocus value={form.note} maxLength={500} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="เช่น มีคราบที่ชายกระโปรง" /></label><button type="button" className="to-ship-primary" disabled={busy} onClick={() => void receive(row)}>{busy ? "กำลังบันทึก…" : "ยืนยันรับคืน"}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button></div>{error && <p className="to-ship-error" role="alert">{error}</p>}</td></tr>}</Fragment>; })}</tbody></table></div>}
  </>;
}
