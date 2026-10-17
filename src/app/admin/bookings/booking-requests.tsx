"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";

type RequestRow = { _id: string; status: string; name: string; phone: string; address: string; pin: string; note: string; method: string; start: string; end: string; days: number; deliveryFee: number; estimatedTotal: number | null; items: { id: number; name: string; sku: string; image: string; dailyRate: number | null }[]; createdAt: string };
const dateLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
const money = (value: number | null) => value === null ? "สอบถามราคา" : `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
const statuses = [{ key: "new", label: "ใหม่" }, { key: "contacted", label: "ติดต่อแล้ว" }, { key: "confirmed", label: "ยืนยันแล้ว" }, { key: "cancelled", label: "ยกเลิก" }];
const methodLabel = (value: string) => value === "pickup" ? "รับเองที่ร้าน" : value === "ems" ? "ไปรษณีย์ / EMS" : "แมสเซนเจอร์";
function safeUrl(value: string) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }

export default function BookingRequests({ initial }: { initial: RequestRow[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = rows.filter(row => filter === "all" || row.status === filter);
  const statusLabel = (key: string) => statuses.find(status => status.key === key)?.label || key;
  async function update(id: string, status: string) {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/admin/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "อัปเดตสถานะไม่สำเร็จ");
      setRows(current => current.map(row => row._id === id ? { ...row, status } : row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "อัปเดตสถานะไม่สำเร็จ"); }
    finally { setBusy(null); }
  }
  return <main className="admin-main bookings-page">
    <header className="bookings-header"><div><span className="bookings-eyebrow">BOOKING INBOX</span><h1>คำขอจองจากหน้าร้าน</h1><p>คำขอใหม่ยังไม่ใช่การยืนยันจอง กรุณาตรวจสอบคิวและติดต่อยืนยันกับลูกค้า</p></div><span className="bookings-total"><Icon name="booking" />{rows.length.toLocaleString("th-TH")} รายการ</span></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <section className="bookings-panel"><div className="bookings-filter" aria-label="กรองสถานะ"><button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>ทั้งหมด {rows.length}</button>{statuses.map(status => <button key={status.key} className={filter === status.key ? "is-active" : ""} onClick={() => setFilter(status.key)}>{status.label} {rows.filter(row => row.status === status.key).length}</button>)}</div>
      {visible.length ? <div className="booking-request-list">{visible.map(row => <article className="booking-request-card" key={row._id}>
        <div className="booking-request-top"><div><span className="booking-request-id">{row._id}</span><span className={`booking-request-status is-${row.status}`}>{statusLabel(row.status)}</span></div><time>{dateLabel(row.createdAt)}</time></div>
        <div className="booking-request-grid"><div><span>ลูกค้า</span><strong>{row.name}</strong><a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a></div><div><span>ช่วงวันเช่า · {row.days} วัน</span><strong>{dateLabel(row.start)} – {dateLabel(row.end)}</strong><small>{methodLabel(row.method)}</small></div><div><span>ประมาณการ</span><strong>{money(row.estimatedTotal)}</strong><small>ค่าส่ง {money(row.deliveryFee)}</small></div>{row.address && <div className="booking-request-wide"><span>ที่อยู่จัดส่ง</span><strong>{row.address}</strong>{safeUrl(row.pin) && <a href={safeUrl(row.pin)} target="_blank" rel="noopener noreferrer">เปิดหมุดแผนที่ <Icon name="arrow" /></a>}</div>}{row.note && <div className="booking-request-wide"><span>หมายเหตุ</span><strong>{row.note}</strong></div>}</div>
        <div className="booking-request-products">{row.items.map(item => <div key={item.id}>{item.image && <Image unoptimized src={item.image} alt="" width={40} height={50} />}<span><strong>{item.name}</strong><small>{item.sku || "ไม่มีรหัสสินค้า"} · {money(item.dailyRate)} / วัน</small></span></div>)}</div>
        <div className="booking-request-actions"><a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}><Icon name="chat" />โทรหาลูกค้า</a><label>อัปเดตสถานะ<select value={row.status} disabled={busy === row._id} onChange={event => update(row._id, event.target.value)}>{statuses.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select></label></div>
      </article>)}</div> : <div className="bookings-empty"><Icon name="booking" /><strong>ไม่มีคำขอในสถานะนี้</strong><span>คำขอจองใหม่จากหน้าร้านจะแสดงที่นี่</span></div>}
    </section>
  </main>;
}
