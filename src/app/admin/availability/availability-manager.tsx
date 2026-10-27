"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { monthCells, monthLabel, queueRole, queueRoleLabels, queueWeekdays, shiftMonth, type QueueBooking, type QueueRole } from "@/lib/queue";

type Product = { id: number; name: string; sku?: string };
type MonthData = { key: string; stock: number; overrides: Record<string, number>; left: Record<string, number>; over: Record<string, number>; bookings: QueueBooking[] | null };
type Mode = "stock" | "closed" | "custom";
const shortDay = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

// One piece's month: who has it each day, what is still free, and the days the shop closes or limits by hand.
export default function AvailabilityManager({ products, initialProductId, initialMonth, today }: { products: Product[]; initialProductId?: number; initialMonth: string; today: string }) {
  const [productId, setProductId] = useState(initialProductId || products[0]?.id || 0);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<MonthData | null>(null);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("closed");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const key = `${productId}:${month}:${version}`;
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    fetch(`/api/admin/availability?productId=${productId}&month=${month}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "โหลดคิวไม่สำเร็จ"); return result; })
      .then(result => setData({ key, stock: result.stock, bookings: result.bookings, overrides: Object.fromEntries(result.overrides.map((day: { date: string; capacity: number }) => [day.date, day.capacity])), left: Object.fromEntries(result.days.map((day: { date: string; remaining: number }) => [day.date, day.remaining])), over: Object.fromEntries(result.days.map((day: { date: string; over: number }) => [day.date, day.over])) }))
      .catch(cause => { if (cause.name !== "AbortError") setError(cause instanceof Error ? cause.message : "โหลดคิวไม่สำเร็จ"); });
    return () => controller.abort();
  }, [productId, month, key]);
  const loaded = data?.key === key ? data : null;
  const matches = search.trim() ? products.filter(product => `${product.sku || ""} ${product.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : products;
  const current = products.find(product => product.id === productId);
  const reset = () => { setSelected([]); setError(""); setNotice(""); };
  const toggle = (day: string) => { setNotice(""); setSelected(list => list.includes(day) ? list.filter(item => item !== day) : [...list, day].sort()); };

  async function save() {
    const capacity = mode === "stock" ? null : mode === "closed" ? 0 : Number(custom);
    if (mode === "custom" && (!Number.isSafeInteger(capacity) || capacity! < 0)) { setError("กรุณากรอกจำนวนชิ้นเป็นตัวเลข 0 ขึ้นไป"); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, month, days: selected.map(date => ({ date, capacity })) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      setNotice(`บันทึก ${selected.length} วันแล้ว`); setSelected([]); setVersion(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }

  return <main className="admin-main availability-page">
    <header className="availability-header"><span className="availability-eyebrow">QUEUE CALENDAR</span><h1>คิวชุดและวันปิดรับ</h1><p>ดูว่าชุดแต่ละตัวถูกจองวันไหนบ้าง และเลือกวันเพื่อปิดรับหรือกำหนดจำนวนชุดเอง เช่น ชุดส่งซ่อมหรือร้านหยุด หน้าร้านจะใช้ข้อมูลนี้ทันที</p></header>
    {!products.length ? <section className="availability-card">ยังไม่มีสินค้าในระบบ</section> : <>
      <section className="availability-card availability-controls">
        <label>ค้นหาชุด<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="รหัสหรือชื่อชุด" /></label>
        <label>ชุด<select value={productId} onChange={event => { reset(); setProductId(Number(event.target.value)); }}>{!matches.some(product => product.id === productId) && current && <option value={current.id}>{current.sku ? `${current.sku} · ` : ""}{current.name}</option>}{matches.map(product => <option value={product.id} key={product.id}>{product.sku ? `${product.sku} · ` : ""}{product.name}</option>)}</select></label>
        <div className="availability-month"><button type="button" onClick={() => { reset(); setMonth(shiftMonth(month, -1)); }} aria-label="เดือนก่อน"><Icon name="chevronLeft" /></button><strong>{monthLabel(month)}</strong><button type="button" onClick={() => { reset(); setMonth(shiftMonth(month, 1)); }} aria-label="เดือนถัดไป"><Icon name="chevron" /></button></div>
      </section>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-success" role="status"><Icon name="success" />{notice}</p>}
      <section className="availability-card">
        <div className="availability-summary"><strong>{current?.sku || current?.name}</strong>{loaded && <span>มีในสต๊อก {loaded.stock} ชิ้น</span>}<span className="availability-tip">แตะวันที่เพื่อเลือก เลือกได้หลายวัน</span></div>
        <ul className="availability-legend"><li className="is-use">ลูกค้าใช้งาน</li><li className="is-ship">จัดส่ง / คืน</li><li className="is-gap">พักชุด</li><li className="is-hold">กันคิวชั่วคราว</li><li className="is-closed">ร้านปิดรับ / ตั้งเอง</li></ul>
        <div className="availability-grid" aria-busy={!loaded}>
          {queueWeekdays.map(name => <span key={name} className="availability-weekday">{name}</span>)}
          {monthCells(month).map((day, index) => {
            if (!day) return <span key={`blank-${index}`} />;
            const left = loaded?.left[day], clash = !!loaded?.over[day], override = loaded?.overrides[day], past = day < today, picked = selected.includes(day);
            const entries = (loaded?.bookings || []).map(booking => ({ booking, role: queueRole(booking, day) })).filter((entry): entry is { booking: QueueBooking; role: QueueRole } => !!entry.role);
            return <div key={day} className={`availability-day${past ? " is-past" : ""}${left === 0 ? " is-full" : ""}${clash ? " is-clash" : ""}${override !== undefined ? " is-override" : ""}${picked ? " is-picked" : ""}${day === today ? " is-today" : ""}`}>
              <button type="button" disabled={past || !loaded} aria-pressed={picked} onClick={() => toggle(day)} aria-label={`เลือกวันที่ ${shortDay(day)}`}>
                <b>{Number(day.slice(8))}</b>
                {loaded && <small>{clash ? "⚠️ คิวซ้อน" : override === 0 ? "ปิดรับ" : left === 0 ? "เต็ม" : `ว่าง ${left}`}{override !== undefined && override > 0 ? ` (ตั้ง ${override})` : ""}</small>}
              </button>
              {entries.map(({ booking, role }) => { const pieces = [...(booking.unitSkus || []), ...(booking.unassignedCount ? [`ยังไม่ระบุชิ้น ${booking.unassignedCount} ชิ้น`] : [])].join(", ") || "ยังไม่ระบุชิ้น"; return <Link key={booking.id} href={booking.href ?? `/admin/bookings?id=${encodeURIComponent(booking.id)}`} className={`availability-chip is-${role}${booking.confirmed ? "" : " is-hold"}`} title={`${booking.id} · ${pieces} · ${booking.name} · ${queueRoleLabels[role]}${booking.confirmed ? "" : " (กันคิวชั่วคราว)"}`}>{pieces} · {booking.name || booking.id.slice(-6)}</Link>; })}
            </div>;
          })}
        </div>
        {loaded && !loaded.bookings && <p className="availability-note">บัญชีนี้ไม่มีสิทธิ์ดูคำขอจอง จึงไม่แสดงชื่อลูกค้า</p>}
      </section>
      {selected.length > 0 && <section className="availability-editor" aria-label="ตั้งค่าวันที่เลือก">
        <p><strong>เลือก {selected.length} วัน</strong><span>{selected.map(shortDay).join(", ")}</span></p>
        <div className="availability-modes">
          <label className={mode === "closed" ? "is-active" : ""}><input type="radio" name="mode" checked={mode === "closed"} onChange={() => setMode("closed")} />ปิดรับ<small>ไม่รับจองเพิ่ม คิวเดิมยังอยู่</small></label>
          <label className={mode === "custom" ? "is-active" : ""}><input type="radio" name="mode" checked={mode === "custom"} onChange={() => setMode("custom")} />กำหนดจำนวนเอง<small>{mode === "custom" ? <input type="number" min="0" max="1000" step="1" value={custom} onChange={event => setCustom(event.target.value)} placeholder="ชิ้น" aria-label="จำนวนชิ้นที่ให้เช่าได้" /> : "จำนวนชิ้นที่ให้เช่าได้ในวันนั้น รวมที่จองแล้ว"}</small></label>
          <label className={mode === "stock" ? "is-active" : ""}><input type="radio" name="mode" checked={mode === "stock"} onChange={() => setMode("stock")} />กลับเป็นปกติ<small>ใช้จำนวนตามสต๊อก ({loaded?.stock ?? "—"} ชิ้น)</small></label>
        </div>
        <div className="availability-editor-actions"><Button variant="ghost" onClick={() => setSelected([])} disabled={saving}>ล้างการเลือก</Button><Button onClick={save} disabled={saving || (mode === "custom" && custom.trim() === "")}><Icon name="check" />{saving ? "กำลังบันทึก…" : "บันทึก"}</Button></div>
      </section>}
    </>}
  </main>;
}
