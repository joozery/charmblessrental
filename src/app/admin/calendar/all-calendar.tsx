"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { monthLabel, queueRoleLabels, shiftMonth, type QueueBooking, type QueueRole } from "@/lib/queue";
import { addDays } from "@/lib/schedule";

export type CalendarProduct = { id: number; name: string; sku: string; stock: number; image: string; bookings: QueueBooking[] };
type Segment = { role: QueueRole; from: string; to: string };
const weekday = (day: string) => ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][new Date(`${day}T12:00:00Z`).getUTCDay()];

// A booking's days split into its steps: shipping out, in use, the return day, and the gap to clean and check.
function segments(booking: QueueBooking): Segment[] {
  const parts: Segment[] = [];
  if (booking.ship < booking.start) parts.push({ role: "ship", from: booking.ship, to: addDays(booking.start, -1) });
  parts.push({ role: "use", from: booking.start, to: booking.end });
  if (booking.returnDate < booking.ready) parts.push({ role: "return", from: booking.returnDate, to: booking.returnDate });
  if (addDays(booking.returnDate, 1) < booking.ready) parts.push({ role: "gap", from: addDays(booking.returnDate, 1), to: addDays(booking.ready, -1) });
  return parts;
}
// Bookings that overlap go on separate lanes (a product with two pieces can be out twice at once).
function lanes(bookings: QueueBooking[]) {
  const result: QueueBooking[][] = [];
  for (const booking of [...bookings].sort((a, b) => a.ship.localeCompare(b.ship))) {
    const lane = result.find(list => list[list.length - 1].ready <= booking.ship);
    if (lane) lane.push(booking); else result.push([booking]);
  }
  return result.length ? result : [[]];
}

export default function AllCalendar({ month, today, products }: { month: string; today: string; products: CalendarProduct[] }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const days = Array.from({ length: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  const first = days[0], last = days[days.length - 1];
  const query = search.trim().toLocaleLowerCase();
  const shown = products.filter(product => (showAll || query || product.bookings.length) && (!query || `${product.sku} ${product.name}`.toLocaleLowerCase().includes(query)));
  const column = (day: string) => days.indexOf(day < first ? first : day > last ? last : day) + 2;
  const busy = products.filter(product => product.bookings.length).length;
  const dayCounts = new Map(days.map(day => [day, new Set(products.flatMap(product => product.bookings.filter(booking => booking.ship <= day && booking.ready > day).map(booking => booking.id))).size]));
  // One grid row per lane, numbered so the cells and the bars on top of them share it (row 1 is the day header).
  const rows = shown.flatMap(product => lanes(product.bookings.filter(booking => booking.ready > first && booking.ship <= last)).map((lane, laneIndex) => ({ product, lane, laneIndex }))).map((row, index) => ({ ...row, gridRow: index + 2 }));

  return <main className="admin-main all-calendar-page">
    <header className="all-calendar-header"><div><span className="all-calendar-eyebrow">ALL PIECES</span><h1>ปฏิทินทุกชุด</h1><p>ทุกชุดในเดือนเดียว: ช่วงจัดส่ง ใช้งาน วันคืน และช่วงพักชุด/ทำความสะอาด กดที่แถบเพื่อดูคำขอ</p></div>
      <div className="all-calendar-month"><Link href={`?month=${shiftMonth(month, -1)}`} aria-label="เดือนก่อน"><Icon name="chevronLeft" /></Link><strong>{monthLabel(month)}</strong><Link href={`?month=${shiftMonth(month, 1)}`} aria-label="เดือนถัดไป"><Icon name="chevron" /></Link></div></header>
    <div className="all-calendar-tools"><label className="all-calendar-search"><Icon name="search" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหารหัสหรือชื่อชุด" /></label><label className="all-calendar-toggle"><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} />แสดงชุดที่ว่างทั้งเดือนด้วย</label><span>{busy.toLocaleString("th-TH")} ชุดมีคิวในเดือนนี้</span></div>
    <ul className="all-calendar-legend"><li className="is-ship">จัดส่ง</li><li className="is-use">ลูกค้าใช้งาน</li><li className="is-return">วันคืน</li><li className="is-gap">พักชุด / ทำความสะอาด</li><li className="is-hold">กันคิวชั่วคราว</li></ul>
    <div className="all-calendar-scroll">
      <div className="all-calendar-grid" style={{ gridTemplateColumns: `minmax(150px, 190px) repeat(${days.length}, minmax(30px, 1fr))` }}>
        <div className="all-calendar-corner">ชุด</div>
        {days.map(day => <Link key={day} href={`/admin/calendar/day?date=${day}`} className={`all-calendar-day${day === today ? " is-today" : ""}${["ส", "อา"].includes(weekday(day)) ? " is-weekend" : ""}`} title={`ดูคิววันที่ ${Number(day.slice(8))}`}><small>{weekday(day)}</small><b>{Number(day.slice(8))}</b>{dayCounts.get(day) ? <em>{dayCounts.get(day)} คิว</em> : null}</Link>)}
        {rows.map(({ product, lane, laneIndex, gridRow }) => <div key={`${product.id}-${laneIndex}`} className="all-calendar-row">
          <div className="all-calendar-label" style={{ gridColumn: 1, gridRow }}>{laneIndex === 0 ? <><strong>{product.sku || product.name}</strong><small>{product.name}{product.stock > 1 ? ` · ${product.stock} ชิ้น` : ""}</small></> : <small>คิวซ้อน / ชิ้นที่ {laneIndex + 1}</small>}</div>
          {days.map(day => <span key={day} className={`all-calendar-cell${day === today ? " is-today" : ""}`} style={{ gridColumn: column(day), gridRow }} />)}
          {lane.flatMap(booking => segments(booking).filter(part => part.to >= first && part.from <= last).map(part => <Link key={`${booking.id}-${part.role}`} href={`/admin/bookings?id=${encodeURIComponent(booking.id)}`} className={`all-calendar-bar is-${part.role}${booking.confirmed ? "" : " is-hold"}`} style={{ gridColumn: `${column(part.from)} / ${column(part.to) + 1}`, gridRow }} title={`${booking.name || booking.id} · ${booking.id} · ${queueRoleLabels[part.role]}${booking.confirmed ? "" : " (กันคิวชั่วคราว)"}`}>{part.role === "use" ? booking.name || booking.id.slice(-6) : ""}</Link>))}
        </div>)}
      </div>
      {!shown.length && <p className="all-calendar-empty">{query ? "ไม่พบชุดที่ค้นหา" : "เดือนนี้ยังไม่มีคิว"}</p>}
    </div>
  </main>;
}
