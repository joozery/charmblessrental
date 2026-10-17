"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { Icon } from "@/components/ui/icon";

type CalendarItem = { productName?: string; sku?: string; image?: string };
type CalendarRental = {
  legacyId: string;
  customerName?: string;
  shipDate?: string;
  returnDate?: string;
  enteredAt?: string;
  legacyStatus?: string;
  total?: number | null;
  items: CalendarItem[];
};
type Event = { rental: CalendarRental; kind: "จัดส่ง" | "คืนสินค้า"; day: string };

const toDay = (value?: string) => value ? new Date(value).toISOString().slice(0, 10) : "";
const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thaiWeekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const shortDate = (day: string) => { if (!day) return "—"; const date = new Date(`${day}T12:00:00Z`); return `${date.getUTCDate()} ${thaiMonths[date.getUTCMonth()]}`; };
const plain = (value?: string) => value?.trim() || "—";
const money = (amount?: number | null) => amount == null ? "—" : `${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

export default function RentalCalendar({ days, start, end, today, rangeLabel, rangeSize, todayWeekStart, rentals }: {
  days: string[]; start: string; end: string; today: string; rangeLabel: string; rangeSize: number; todayWeekStart: string; rentals: CalendarRental[];
}) {
  const [selected, setSelected] = useState<CalendarRental | null>(null);
  const [selectedKind, setSelectedKind] = useState<Event["kind"]>("จัดส่ง");
  const calendarEnd = end < addDay(start, 30) ? end : addDay(start, 30);
  const calendarHref = (fromDay: string, toDay: string) => `/admin?${new URLSearchParams({ from: fromDay, to: toDay }).toString()}#rental-calendar-title`;
  const eventsFor = (day: string) => rentals.flatMap(rental => [
    ...(toDay(rental.shipDate) === day ? [{ rental, kind: "จัดส่ง" as const, day }] : []),
    ...(toDay(rental.returnDate) === day ? [{ rental, kind: "คืนสินค้า" as const, day }] : []),
  ]);

  return <>
    <section className="dashboard-panel dashboard-calendar" aria-labelledby="rental-calendar-title">
      <div className="dashboard-calendar-toolbar">
        <div className="dashboard-calendar-title"><span className="dashboard-kicker">SCHEDULE</span><h2 id="rental-calendar-title">ปฏิทินคิวเช่า</h2></div>
        <div className="dashboard-calendar-controls"><div className="dashboard-calendar-nav"><a href={calendarHref(addDay(start, -rangeSize), addDay(end, -rangeSize))} aria-label="ช่วงก่อนหน้า"><Icon name="chevronLeft" /></a><a href={calendarHref(addDay(start, rangeSize), addDay(end, rangeSize))} aria-label="ช่วงถัดไป"><Icon name="chevron" /></a></div><a className="dashboard-calendar-today" href={calendarHref(todayWeekStart, addDay(todayWeekStart, 6))}>วันนี้</a><strong className="dashboard-calendar-period">{rangeLabel}</strong><span className="dashboard-calendar-view">ช่วงวันที่</span></div>
      </div>
      <div className="dashboard-calendar-legend" aria-label="ประเภทคิว"><span className="is-out"><i />จัดส่ง</span><span className="is-back"><i />คืนสินค้า</span><span className="dashboard-calendar-all-day">ทั้งวัน</span></div>
      <div className="dashboard-calendar-scroll"><div className="dashboard-week-grid">{days.map(day => { const inSelectedRange = day >= start && day <= calendarEnd; const events = inSelectedRange ? eventsFor(day) : []; const date = new Date(`${day}T12:00:00Z`); return <article className={`dashboard-week-day ${day === today ? "is-current" : ""} ${inSelectedRange ? "" : "is-outside-range"}`} key={day}><div className="dashboard-week-label"><span>{thaiWeekdays[date.getUTCDay()]}</span><strong>{shortDate(day)}</strong>{events.length > 0 && <em>{events.length}</em>}</div><div className="dashboard-day-queue">{events.slice(0, 3).map(({ rental, kind }) => <button type="button" className={`dashboard-calendar-event ${kind === "คืนสินค้า" ? "is-back" : "is-out"}`} key={`${kind}-${rental.legacyId}`} onClick={() => { setSelected(rental); setSelectedKind(kind); }} aria-label={`ดูรายละเอียด ${kind} ${rental.legacyId}`}><strong>{kind} · {rental.legacyId}</strong><small>{plain(rental.customerName)}</small></button>)}{events.length > 3 && <span className="dashboard-day-more">อีก {events.length - 3} คิว</span>}{inSelectedRange && events.length === 0 && <span className="dashboard-no-event">ไม่มีคิว</span>}</div></article>; })}</div></div>
      <p className="dashboard-calendar-note">กดรายการจัดส่งหรือคืนเพื่อดูรายละเอียด · รายการเดิมไม่มีเวลา จึงแสดงเป็นคิวทั้งวัน{end > calendarEnd ? ` · ปฏิทินแสดง 31 วันแรก (${shortDate(start)} – ${shortDate(calendarEnd)})` : ""}</p>
    </section>
    <Dialog.Root open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog rental-detail-dialog"><div className="rental-detail-heading"><span className={`rental-detail-icon ${selectedKind === "คืนสินค้า" ? "is-return" : ""}`}><Icon name={selectedKind === "คืนสินค้า" ? "arrowLeft" : "delivery"} /></span><div><span className="dashboard-kicker">รายละเอียดการเช่า</span><Dialog.Title>{selected?.legacyId || "รายการเช่า"}</Dialog.Title></div></div><Dialog.Description className="rental-detail-description">ข้อมูลรายการจากฐานข้อมูลการเช่าเดิม</Dialog.Description>{selected && <><div className="rental-detail-grid"><div><span>ลูกค้า</span><strong>{plain(selected.customerName)}</strong></div><div><span>สถานะ</span><strong>{plain(selected.legacyStatus)}</strong></div><div><span>กำหนดจัดส่ง</span><strong>{shortDate(toDay(selected.shipDate))}</strong></div><div><span>กำหนดคืน</span><strong>{shortDate(toDay(selected.returnDate))}</strong></div><div><span>วันที่สร้างรายการ</span><strong>{shortDate(toDay(selected.enteredAt))}</strong></div><div><span>ยอดรวม</span><strong>{money(selected.total)}</strong></div></div><div className="rental-detail-items"><h3>สินค้าในรายการ</h3>{selected.items.length ? selected.items.map((item, index) => <div className="rental-detail-product" key={`${item.sku || item.productName}-${index}`}><span className="rental-detail-product-image">{item.image ? <Image unoptimized src={item.image} alt={item.productName || "รูปสินค้าเช่า"} width={60} height={76} /> : <Icon name="image" />}</span><span className="rental-detail-product-copy"><strong>{item.productName || "สินค้า"}</strong><small>{item.sku || "ไม่มีรหัสสินค้า"}</small></span></div>) : <p>ไม่มีข้อมูลสินค้าแยกตามรายการเช่า</p>}</div></>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดรายละเอียด"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

function addDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
