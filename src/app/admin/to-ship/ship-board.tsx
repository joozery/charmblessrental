"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

export type ShipRow = {
  // `legacy`: a rental imported from the old sheet, shipped through /api/admin/rentals and shown on the rentals page.
  id: string; legacy?: boolean; name: string; phone: string; address: string; pickup: boolean; methodLabel: string;
  shipDay: string; start: string; returnDay: string; paidAt: string; identityPending: boolean;
  items: { name: string; sku: string; image: string; ready: boolean; state: string }[];
};
const carriers = ["ไปรษณีย์ไทย", "Flash Express", "Kerry Express", "J&T Express", "แมสเซนเจอร์", "Lalamove"];
const detailHref = (row: ShipRow) => row.legacy ? `/admin/rentals?q=${encodeURIComponent(row.id)}` : `/admin/bookings?id=${encodeURIComponent(row.id)}`;
const addDays = (day: string, by: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
const dayLabel = (day: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
type Tab = "all" | "late" | "today" | "tomorrow" | "later";
const bucketFor = (row: ShipRow, today: string, tomorrow: string): Exclude<Tab, "all"> => row.shipDay < today ? "late" : row.shipDay === today ? "today" : row.shipDay === tomorrow ? "tomorrow" : "later";

export default function ShipBoard({ rows: initial, today }: { rows: ShipRow[]; today: string }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<{ id: string; carrier: string; trackingNumber: string } | null>(null);
  const [query, setQuery] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [copied, setCopied] = useState("");
  const [preview, setPreview] = useState<{ items: ShipRow["items"]; index: number } | null>(null);
  const tomorrow = addDays(today, 1);
  const bucket = (row: ShipRow) => bucketFor(row, today, tomorrow);
  const counts = useMemo(() => ({
    all: rows.length,
    late: rows.filter(row => bucketFor(row, today, tomorrow) === "late").length,
    today: rows.filter(row => bucketFor(row, today, tomorrow) === "today").length,
    tomorrow: rows.filter(row => bucketFor(row, today, tomorrow) === "tomorrow").length,
    later: rows.filter(row => bucketFor(row, today, tomorrow) === "later").length,
  }), [rows, today, tomorrow]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter(row => (tab === "all" || bucketFor(row, today, tomorrow) === tab) && (!shipDate || row.shipDay === shipDate) && (!text || `${row.id} ${row.name} ${row.phone} ${row.address} ${row.items.map(item => `${item.name} ${item.sku}`).join(" ")}`.toLowerCase().includes(text)));
  }, [rows, query, shipDate, tab, today, tomorrow]);

  async function copyCustomer(row: ShipRow) {
    const value = [`ชื่อ: ${row.name}`, `เบอร์โทร: ${row.phone}`, ...(!row.pickup && row.address ? [`ที่อยู่: ${row.address}`] : [])].join("\n");
    try { await navigator.clipboard.writeText(value); setCopied(row.id); window.setTimeout(() => setCopied(current => current === row.id ? "" : current), 1600); } catch { setError("คัดลอกข้อมูลไม่สำเร็จ กรุณาลองใหม่"); }
  }
  async function ship(row: ShipRow) {
    if (!form) return;
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch(row.legacy ? "/api/admin/rentals" : "/api/admin/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action: "ship", carrier: row.pickup ? "" : form.carrier.trim(), trackingNumber: row.pickup ? "" : form.trackingNumber.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกการจัดส่งไม่สำเร็จ");
      setRows(current => current.filter(item => item.id !== row.id)); setForm(null);
      setDone(`${row.id} ${row.pickup ? "ส่งมอบแล้ว" : "บันทึกเลขพัสดุแล้ว"}${data.lineNotified ? " · แจ้งลูกค้าทาง LINE แล้ว" : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกการจัดส่งไม่สำเร็จ"); } finally { setBusy(false); }
  }
  function exportCsv() {
    const head = ["เลขออเดอร์", "วันที่ต้องส่ง", "วันที่ลูกค้าคืน", "ลูกค้า", "เบอร์โทร", "สินค้า", "ที่อยู่", "ขนส่ง", "สถานะ"];
    const csv = [head, ...visible.map(row => [row.id, row.shipDay, row.returnDay, row.name, row.phone, row.items.map(item => `${item.sku} ${item.name}`).join(" | "), row.address, row.methodLabel, bucket(row)])].map(line => line.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `to-ship-${today}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  function movePreview(direction: -1 | 1) {
    if (!preview || preview.items.length < 2) return;
    let next = preview.index;
    for (let step = 0; step < preview.items.length; step += 1) {
      next = (next + direction + preview.items.length) % preview.items.length;
      if (preview.items[next]?.image) { setPreview({ ...preview, index: next }); return; }
    }
  }
  const tabs: { key: Tab; label: string; tone: string }[] = [{ key: "all", label: "ทั้งหมด", tone: "blue" }, { key: "late", label: "เลยกำหนด", tone: "red" }, { key: "today", label: "ต้องส่งวันนี้", tone: "orange" }, { key: "tomorrow", label: "ต้องส่งพรุ่งนี้", tone: "blue" }, { key: "later", label: "ส่งวันถัดไป", tone: "gray" }];

  return <>
    <div className="to-ship-toolbar"><label className="to-ship-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร, เลขออเดอร์, เลขพัสดุ, ที่อยู่..." /></label><label className="to-ship-date">วันที่ต้องส่ง<input type="date" aria-label="วันที่ต้องส่ง" value={shipDate} onChange={event => setShipDate(event.target.value)} /></label><select value={tab} onChange={event => setTab(event.target.value as Tab)} aria-label="กรองสถานะ"><option value="all">สถานะการจัดส่ง · ทั้งหมด</option><option value="late">เลยกำหนด</option><option value="today">ต้องส่งวันนี้</option><option value="tomorrow">ต้องส่งพรุ่งนี้</option><option value="later">ส่งวันถัดไป</option></select><button type="button" onClick={() => { setQuery(""); setShipDate(""); setTab("all"); }}>รีเซ็ต</button><button type="button" className="to-ship-primary" onClick={exportCsv}>⇩ ส่งออก CSV</button></div>
    <div className="to-ship-tabs" role="tablist" aria-label="กรองรายการจัดส่ง">{tabs.map(item => <button type="button" role="tab" aria-selected={tab === item.key} className={`is-${item.tone} ${tab === item.key ? "is-active" : ""}`} key={item.key} onClick={() => setTab(item.key)}><span>{item.label}</span><b>{counts[item.key]}</b></button>)}</div>
    {done && <p className="to-ship-done" role="status">✓ {done}</p>}{error && !form && <p className="to-ship-error" role="alert">{error}</p>}
    {!visible.length && <p className="to-ship-empty">ไม่พบรายการที่ต้องส่งตามตัวกรองนี้</p>}
    {!!visible.length && <div className="to-ship-table-wrap"><table className="to-ship-table"><thead><tr><th>วันที่ต้องส่ง</th><th>เลขออเดอร์</th><th>ลูกค้า</th><th>สินค้า</th><th>ที่อยู่จัดส่ง</th><th>ขนส่ง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{visible.map(row => { const kind = bucket(row); const open = form?.id === row.id; return <Fragment key={row.id}><tr className={`is-${kind}`}><td><strong>{row.pickup ? "รับที่ร้าน" : dayLabel(row.shipDay)}</strong><small>คืน {dayLabel(row.returnDay)}</small></td><td><Link href={detailHref(row)} className="to-ship-order">{row.id}</Link>{row.legacy && <small className="to-ship-legacy">ระบบเดิม</small>}<small>ใช้งาน {dayLabel(row.start)}</small></td><td><strong>{row.name}</strong><a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a><button type="button" className="to-ship-copy" onClick={() => void copyCustomer(row)}>{copied === row.id ? "คัดลอกแล้ว" : "คัดลอกข้อมูล"}</button></td><td><div className="to-ship-product-list">{row.items.map((item, index) => <div className="to-ship-product-item" key={`${item.sku}-${index}`}>{item.image ? <button type="button" className="to-ship-product-image" aria-label={`ดูรูป ${item.name}`} onClick={() => setPreview({ items: row.items, index })}><img src={item.image} alt="" /></button> : <span className="to-ship-product-image" />}<div><strong>{item.sku || "—"}</strong><small>{item.name}</small>{!item.ready && <em>{item.state || "ยังเตรียมไม่ครบ"}</em>}</div></div>)}</div></td><td><span className="to-ship-address-cell">{row.pickup ? "รับสินค้าที่ร้าน" : row.address || "—"}</span></td><td>{row.methodLabel}</td><td><span className={`to-ship-status is-${kind}`}>{kind === "late" ? "เลยกำหนด" : kind === "today" ? "ต้องส่งวันนี้" : kind === "tomorrow" ? "ต้องส่งพรุ่งนี้" : "รอจัดส่ง"}</span>{row.identityPending && <small className="to-ship-status-note">รอยืนยันตัวตน</small>}</td><td><div className="to-ship-row-actions"><button type="button" className="to-ship-primary" disabled={busy || row.identityPending} onClick={() => { setError(""); setForm({ id: row.id, carrier: carriers[0], trackingNumber: "" }); }}>{row.pickup ? "ยืนยันส่งมอบ" : "บันทึกเลขพัสดุ"}</button><a href={detailHref(row)}>รายละเอียด</a></div></td></tr>{open && <tr className="to-ship-form-row"><td colSpan={8}><div className="to-ship-form">{!row.pickup && <><label>ขนส่ง<input list="to-ship-carriers" value={form.carrier} maxLength={60} onChange={event => setForm({ ...form, carrier: event.target.value })} /></label><label>เลขพัสดุ<input autoFocus value={form.trackingNumber} maxLength={60} onChange={event => setForm({ ...form, trackingNumber: event.target.value })} placeholder="เช่น TH123456789" /></label></>}<button type="button" className="to-ship-primary" disabled={busy || (!row.pickup && !form.trackingNumber.trim())} onClick={() => void ship(row)}>{busy ? "กำลังบันทึก…" : row.pickup ? "ยืนยันส่งมอบที่ร้าน" : "บันทึกการจัดส่ง"}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button></div>{error && <p className="to-ship-error" role="alert">{error}</p>}</td></tr>}</Fragment>; })}</tbody></table></div>}
    {preview && <div className="to-ship-image-overlay" role="dialog" aria-modal="true" aria-label="ดูรูปสินค้า" onClick={() => setPreview(null)}><div className="to-ship-image-dialog" onClick={event => event.stopPropagation()}><button type="button" className="to-ship-image-close" aria-label="ปิดรูปสินค้า" onClick={() => setPreview(null)}>×</button>{preview.items[preview.index]?.image && <img src={preview.items[preview.index].image} alt={preview.items[preview.index].name} />}<div className="to-ship-image-caption"><strong>{preview.items[preview.index]?.sku}</strong><span>{preview.items[preview.index]?.name}</span><small>{preview.items.filter(item => item.image).findIndex(item => item === preview.items[preview.index]) + 1} / {preview.items.filter(item => item.image).length}</small></div>{preview.items.filter(item => item.image).length > 1 && <><button type="button" className="to-ship-image-nav is-prev" aria-label="รูปก่อนหน้า" onClick={() => movePreview(-1)}>‹</button><button type="button" className="to-ship-image-nav is-next" aria-label="รูปถัดไป" onClick={() => movePreview(1)}>›</button></>}</div></div>}
    <datalist id="to-ship-carriers">{carriers.map(carrier => <option key={carrier} value={carrier} />)}</datalist>
  </>;
}
