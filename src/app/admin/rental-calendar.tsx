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

export default function RentalCalendar({ days, start, end, today, rangeLabel, todayWeekStart, rentals }: {
  days: string[]; start: string; end: string; today: string; rangeLabel: string; rangeSize: number; todayWeekStart: string; rentals: CalendarRental[];
}) {
  return <RentalCalendarContent key={`${start}:${end}`} days={days} start={start} end={end} today={today} rangeLabel={rangeLabel} todayWeekStart={todayWeekStart} rentals={rentals} />;
}

function RentalCalendarContent({ days, start, end, today, rangeLabel, todayWeekStart, rentals }: {
  days: string[]; start: string; end: string; today: string; rangeLabel: string; todayWeekStart: string; rentals: CalendarRental[];
}) {
  const [period, setPeriod] = useState({ start, end, rangeLabel, rentals, days });
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<CalendarRental | null>(null);
  const [selectedKind, setSelectedKind] = useState<Event["kind"]>("จัดส่ง");
  const viewStart = period.start;
  const viewEnd = period.end;
  const calendarEnd = viewEnd < addDay(viewStart, 30) ? viewEnd : addDay(viewStart, 30);
  const viewRangeSize = Math.max(1, Math.round((Date.parse(`${viewEnd}T12:00:00Z`) - Date.parse(`${viewStart}T12:00:00Z`)) / 86400000) + 1);
  const visibleDays = buildDays(viewStart, calendarEnd);
  const visibleRangeLabel = viewStart === start && viewEnd === end ? rangeLabel : dateLabel(viewStart, viewEnd);
  async function showRange(fromDay: string, toDay: string) {
    if (busy) return;
    setBusy(true); setLoadError("");
    try {
      const fetchTo = toDay < addDay(fromDay, 30) ? toDay : addDay(fromDay, 30);
      const response = await fetch(`/api/admin/calendar?${new URLSearchParams({ from: fromDay, to: fetchTo })}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.rentals)) throw new Error(data.error || "โหลดคิวไม่สำเร็จ");
      setPeriod({ start: fromDay, end: toDay, rangeLabel: dateLabel(fromDay, toDay), days: buildDays(fromDay, fetchTo), rentals: data.rentals });
    } catch (error) { setLoadError(error instanceof Error ? error.message : "โหลดคิวไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }
  const eventsFor = (day: string) => period.rentals.flatMap(rental => [
    ...(toDay(rental.shipDate) === day ? [{ rental, kind: "จัดส่ง" as const, day }] : []),
    ...(toDay(rental.returnDate) === day ? [{ rental, kind: "คืนสินค้า" as const, day }] : []),
  ]);

  return <>
    <section className="dashboard-panel dashboard-calendar" aria-labelledby="rental-calendar-title">
      <div className="dashboard-calendar-toolbar">
        <div className="dashboard-calendar-title"><span className="dashboard-kicker">SCHEDULE</span><h2 id="rental-calendar-title">ปฏิทินคิวเช่า</h2></div>
        <div className="dashboard-calendar-controls"><div className="dashboard-calendar-nav"><button type="button" disabled={busy} onClick={() => showRange(addDay(viewStart, -viewRangeSize), addDay(viewEnd, -viewRangeSize))} aria-label="ช่วงก่อนหน้า"><Icon name="chevronLeft" /></button><button type="button" disabled={busy} onClick={() => showRange(addDay(viewStart, viewRangeSize), addDay(viewEnd, viewRangeSize))} aria-label="ช่วงถัดไป"><Icon name="chevron" /></button></div><button type="button" className="dashboard-calendar-today" disabled={busy} onClick={() => showRange(todayWeekStart, addDay(todayWeekStart, 6))}>วันนี้</button><strong className="dashboard-calendar-period">{visibleRangeLabel}</strong><span className="dashboard-calendar-view">ช่วงวันที่</span></div>
      </div>
      {loadError && <p className="dashboard-calendar-error" role="alert">{loadError}</p>}
      <div className="dashboard-calendar-legend" aria-label="ประเภทคิว"><span className="is-out"><i />จัดส่ง</span><span className="is-back"><i />คืนสินค้า</span><span className="dashboard-calendar-all-day">ทั้งวัน</span></div>
      <div className="dashboard-calendar-scroll"><div className="dashboard-week-grid">{visibleDays.map(day => { const inSelectedRange = day >= viewStart && day <= calendarEnd; const events = inSelectedRange ? eventsFor(day) : []; const date = new Date(`${day}T12:00:00Z`); return <article className={`dashboard-week-day ${day === today ? "is-current" : ""} ${inSelectedRange ? "" : "is-outside-range"}`} key={day}><div className="dashboard-week-label"><span>{thaiWeekdays[date.getUTCDay()]}</span><strong>{shortDate(day)}</strong>{events.length > 0 && <em>{events.length}</em>}</div><div className="dashboard-day-queue">{events.slice(0, 3).map(({ rental, kind }) => <button type="button" className={`dashboard-calendar-event ${kind === "คืนสินค้า" ? "is-back" : "is-out"}`} key={`${kind}-${rental.legacyId}`} onClick={() => { setSelected(rental); setSelectedKind(kind); }} aria-label={`ดูรายละเอียด ${kind} ${rental.legacyId}`}><strong>{kind} · {rental.legacyId}</strong><small>{plain(rental.customerName)}</small></button>)}{events.length > 3 && <span className="dashboard-day-more">อีก {events.length - 3} คิว</span>}{inSelectedRange && events.length === 0 && <span className="dashboard-no-event">ไม่มีคิว</span>}</div></article>; })}</div></div>
      <p className="dashboard-calendar-note">กดรายการจัดส่งหรือคืนเพื่อดูรายละเอียด · รายการเดิมไม่มีเวลา จึงแสดงเป็นคิวทั้งวัน{viewEnd > calendarEnd ? ` · ปฏิทินแสดง 31 วันแรก (${shortDate(viewStart)} – ${shortDate(calendarEnd)})` : ""}</p>
    </section>
    <Dialog.Root open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog rental-detail-dialog"><div className="rental-detail-heading"><span className={`rental-detail-icon ${selectedKind === "คืนสินค้า" ? "is-return" : ""}`}><Icon name={selectedKind === "คืนสินค้า" ? "arrowLeft" : "delivery"} /></span><div><span className="dashboard-kicker">รายละเอียดการเช่า</span><Dialog.Title>{selected?.legacyId || "รายการเช่า"}</Dialog.Title></div></div><Dialog.Description className="rental-detail-description">ข้อมูลรายการจากฐานข้อมูลการเช่าเดิม</Dialog.Description>{selected && <><div className="rental-detail-grid"><div><span>ลูกค้า</span><strong>{plain(selected.customerName)}</strong></div><div><span>สถานะ</span><strong>{plain(selected.legacyStatus)}</strong></div><div><span>กำหนดจัดส่ง</span><strong>{shortDate(toDay(selected.shipDate))}</strong></div><div><span>กำหนดคืน</span><strong>{shortDate(toDay(selected.returnDate))}</strong></div><div><span>วันที่สร้างรายการ</span><strong>{shortDate(toDay(selected.enteredAt))}</strong></div><div><span>ยอดรวม</span><strong>{money(selected.total)}</strong></div></div><div className="rental-detail-items"><h3>สินค้าในรายการ</h3>{selected.items.length ? selected.items.map((item, index) => <div className="rental-detail-product" key={`${item.sku || item.productName}-${index}`}><span className="rental-detail-product-image">{item.image ? <Image unoptimized src={item.image} alt={item.productName || "รูปสินค้าเช่า"} width={60} height={76} /> : <Icon name="image" />}</span><span className="rental-detail-product-copy"><strong>{item.productName || "สินค้า"}</strong><small>{item.sku || "ไม่มีรหัสสินค้า"}</small></span></div>) : <p>ไม่มีข้อมูลสินค้าแยกตามรายการเช่า</p>}</div></>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดรายละเอียด"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

function addDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildDays(start: string, end: string) {
  if (!start || !end || start > end) return [];
  const first = addDay(start, -new Date(`${start}T12:00:00Z`).getUTCDay());
  const last = addDay(end, 6 - new Date(`${end}T12:00:00Z`).getUTCDay());
  const days: string[] = [];
  for (let day = first; day <= last; day = addDay(day, 1)) days.push(day);
  return days;
}

function dateLabel(start: string, end: string) {
  const format = (day: string, year: boolean) => {
    const date = new Date(`${day}T12:00:00Z`);
    return `${date.getUTCDate()} ${thaiMonths[date.getUTCMonth()]}${year ? ` ${date.getUTCFullYear() + 543}` : ""}`;
  };
  return start === end ? format(start, true) : `${format(start, start.slice(0, 4) !== end.slice(0, 4))} – ${format(end, true)}`;
}
