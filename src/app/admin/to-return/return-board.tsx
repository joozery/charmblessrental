"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

export type ReturnRow = {
  id: string; legacy?: boolean; name: string; phone: string; pickup: boolean; returnDay: string; start: string;
  items: { name: string; sku: string; image: string }[];
  customerReturn: { carrier: string; trackingNumber: string; at: string } | null;
};
type Tab = "all" | "late" | "today" | "later";
const addDays = (day: string, by: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
const dayLabel = (day: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const bucketFor = (row: ReturnRow, today: string, tomorrow: string) => row.returnDay < today ? "late" : row.returnDay === today ? "today" : row.returnDay === tomorrow ? "today" : "later";

export default function ReturnBoard({ rows: initial, today, page, pageCount: initialPageCount, total: initialTotal, filters }: { rows: ReturnRow[]; today: string; page: number; pageCount: number; total: number; filters: { query: string; tab: string } }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<{ id: string; condition: "good" | "damaged" | "missing"; note: string } | null>(null);
  const [query, setQuery] = useState(filters.query);
  const [tab, setTab] = useState<Tab>((filters.tab as Tab) || "all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [meta, setMeta] = useState({ total: initialTotal, pageCount: initialPageCount });
  const router = useRouter();
  useEffect(() => {
    setRows(initial);
    setQuery(filters.query);
    setTab((filters.tab as Tab) || "all");
    setMeta({ total: initialTotal, pageCount: initialPageCount });
  }, [initial, initialPageCount, initialTotal, filters.query, filters.tab]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(); if (filters.query.trim()) params.set("q", filters.query.trim()); if (filters.tab !== "all") params.set("tab", filters.tab);
    void fetch(`/api/admin/to-return/meta?${params}`).then(response => response.ok ? response.json() : null).then(data => { if (active && data && typeof data.total === "number") setMeta({ total: data.total, pageCount: Math.max(1, Math.ceil(data.total / 20)) }); }).catch(() => undefined);
    return () => { active = false; };
  }, [filters.query, filters.tab]);
  const total = meta.total, pageCount = meta.pageCount;
  const tomorrow = addDays(today, 1);
  const bucket = (row: ReturnRow) => bucketFor(row, today, tomorrow);
  const counts = {
    all: total,
    late: rows.filter(row => bucketFor(row, today, tomorrow) === "late").length,
    today: rows.filter(row => bucketFor(row, today, tomorrow) === "today").length,
    later: rows.filter(row => bucketFor(row, today, tomorrow) === "later").length,
  };
  const text = query.trim().toLowerCase();
  const visible = rows.filter(row => (tab === "all" || bucketFor(row, today, tomorrow) === tab) && (!text || `${row.id} ${row.name} ${row.phone} ${row.items.map(item => `${item.name} ${item.sku}`).join(" ")} ${row.customerReturn?.trackingNumber || ""}`.toLowerCase().includes(text)));
  const navigate = (nextPage: number, nextQuery = query, nextTab = tab) => { const params = new URLSearchParams({ page: String(nextPage) }); if (nextQuery.trim()) params.set("q", nextQuery.trim()); if (nextTab !== "all") params.set("tab", nextTab); router.push(`/admin/to-return?${params.toString()}`); };
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
    <div className="to-ship-toolbar"><label className="to-ship-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") navigate(1); }} placeholder="ค้นหาชื่อลูกค้า เบอร์โทร เลขออเดอร์ หรือเลขพัสดุ" /></label><select value={tab} onChange={event => { const next = event.target.value as Tab; setTab(next); navigate(1, query, next); }} aria-label="กรองสถานะ"><option value="all">สถานะการส่งคืน · ทั้งหมด</option><option value="late">เลยกำหนด</option><option value="today">ถึงกำหนดวันนี้/พรุ่งนี้</option><option value="later">กำหนดภายหลัง</option></select><button type="button" onClick={() => { setQuery(""); setTab("all"); navigate(1, "", "all"); }}>รีเซ็ต</button></div>
    <div className="to-ship-tabs" role="tablist" aria-label="กรองรายการส่งคืน">{tabs.map(item => <button type="button" role="tab" aria-selected={tab === item.key} className={`is-${item.tone} ${tab === item.key ? "is-active" : ""}`} key={item.key} onClick={() => { setTab(item.key); navigate(1, query, item.key); }}><span>{item.label}</span><b>{counts[item.key]}</b></button>)}</div>
    {done && <p className="to-ship-done" role="status">✓ {done}</p>}{error && !form && <p className="to-ship-error" role="alert">{error}</p>}
    {!visible.length && <p className="to-ship-empty">ไม่พบรายการที่ต้องส่งคืนตามตัวกรองนี้</p>}
    {!!visible.length && <div className="to-ship-table-wrap"><table className="to-ship-table"><thead><tr><th>กำหนดส่งคืน</th><th>เลขออเดอร์</th><th>ลูกค้า</th><th>สินค้า</th><th>ข้อมูลส่งคืน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{visible.map(row => { const kind = bucket(row); const open = form?.id === row.id; return <Fragment key={row.id}><tr className={`is-${kind}`}><td><strong>{row.pickup ? "รับคืนที่ร้าน" : dayLabel(row.returnDay)}</strong><small>ใช้งาน {dayLabel(row.start)}</small></td><td><Link href={`/admin/bookings?id=${encodeURIComponent(row.id)}`} className="to-ship-order">{row.id}</Link></td><td><strong>{row.name}</strong><a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a></td><td><div className="to-ship-product-list">{row.items.map((item, index) => <div className="to-ship-product-item" key={`${item.sku}-${index}`}><span className="to-ship-product-image">{item.image && <img src={item.image} alt="" />}</span><div><strong>{item.sku || "—"}</strong><small>{item.name}</small></div></div>)}</div></td><td>{row.customerReturn ? <><strong>{row.customerReturn.carrier}</strong><small>{row.customerReturn.trackingNumber || "แจ้งทาง LINE"}</small></> : <span>ยังไม่แจ้งเลขพัสดุ</span>}</td><td><span className={`to-ship-status is-${kind}`}>{kind === "late" ? "เลยกำหนด" : kind === "today" ? "ใกล้ถึงกำหนด" : "รอส่งคืน"}</span>{row.customerReturn && <small className="to-ship-status-note">ลูกค้าแจ้งแล้ว · รอร้านรับ</small>}</td><td><div className="to-ship-row-actions"><button type="button" className="to-ship-primary" disabled={busy} onClick={() => { setError(""); setForm({ id: row.id, condition: "good", note: "" }); }}>ยืนยันรับคืน</button><a href={`/admin/bookings?id=${encodeURIComponent(row.id)}`}>รายละเอียด</a></div></td></tr>{open && <tr className="to-ship-form-row"><td colSpan={7}><div className="to-ship-form"><label>สภาพสินค้า<select value={form.condition} onChange={event => setForm({ ...form, condition: event.target.value as "good" | "damaged" | "missing" })}><option value="good">ปกติ</option><option value="damaged">ชำรุด</option><option value="missing">สูญหาย/ไม่ครบ</option></select></label><label>หมายเหตุ<input autoFocus value={form.note} maxLength={500} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="เช่น มีคราบที่ชายกระโปรง" /></label><button type="button" className="to-ship-primary" disabled={busy} onClick={() => void receive(row)}>{busy ? "กำลังบันทึก…" : "ยืนยันรับคืน"}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button></div>{error && <p className="to-ship-error" role="alert">{error}</p>}</td></tr>}</Fragment>; })}</tbody></table></div>}    {!!visible.length && <nav className="to-ship-pagination" aria-label="แบ่งหน้ารายการ"><strong>หน้า {page} / {pageCount}</strong><span>แสดง {((page - 1) * 20) + 1}-{Math.min(page * 20, total)} จาก {total} รายการ</span><div><button type="button" disabled={page === 1} onClick={() => navigate(page - 1)}>ก่อนหน้า</button>{Array.from({ length: pageCount }, (_, index) => index + 1).filter(item => item === 1 || item === pageCount || Math.abs(item - page) <= 2).map((item, index, items) => <Fragment key={item}>{index > 0 && items[index - 1] !== item - 1 && <em>…</em>}<button type="button" className={item === page ? "is-active" : ""} aria-current={item === page ? "page" : undefined} onClick={() => navigate(item)}>{item}</button></Fragment>)}<button type="button" disabled={page === pageCount} onClick={() => navigate(page + 1)}>ถัดไป</button></div></nav>}
  </>;
}
