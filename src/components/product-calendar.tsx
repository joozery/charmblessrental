"use client";
import { useEffect, useState } from "react";
import { Icon } from "./ui/icon";
import RentalTimeline from "./rental-timeline";
import { useToday } from "@/lib/use-today";
import { useStoreSettings } from "@/components/store-settings-provider";
import { addDays, dayRole, dayRoleLabels, planFor, returnMethods, type ReturnMethod } from "@/lib/schedule";

export type CalendarChoice = { start: string; end: string; method: string; returnMethod: ReturnMethod };
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (date: Date, count: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
const long = (day: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

// Pick the first and last day of use; the calendar shades the whole span the piece is away (shipping → gap) and flags any full day in it.
export default function ProductCalendar({ productId, value, onChange }: { productId: number; value: CalendarChoice; onChange: (value: CalendarChoice) => void }) {
  const settings = useStoreSettings();
  const today = useToday();
  const [picked, setMonth] = useState<Date | null>(null);
  const month = picked ?? new Date(`${(today || "2000-01-01").slice(0, 7)}-01T00:00:00Z`);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [capacity, setCapacity] = useState<Record<string, number>>({});
  const [waitable, setWaitable] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  // Fetch the month before and after too, so a rental crossing a month boundary is checked in full.
  useEffect(() => {
    if (!today) return;
    const controller = new AbortController();
    fetch(`/api/availability?productId=${productId}&month=${monthKey(shiftMonth(month, -1))}&months=3`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.days as { date: string; capacity: number; remaining: number; waitable?: boolean }[]; })
      .then(days => { setLeft(Object.fromEntries(days.map(day => [day.date, day.remaining]))); setCapacity(Object.fromEntries(days.map(day => [day.date, day.capacity]))); setWaitable(Object.fromEntries(days.map(day => [day.date, !!day.waitable]))); setLoaded(true); })
      .catch(error => { if (error.name !== "AbortError") setLoaded(true); });
    return () => controller.abort();
  }, [productId, today, monthKey(month)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The month grid needs today's date, which only the browser knows.
  if (!today) return <div className="product-calendar" aria-busy="true" />;
  const standard = settings.shippingOptions.find(option => option.enabled && option.standard)?.id;
  const modes = [...(standard ? [{ key: standard, label: "ส่งพัสดุ" }] : []), { key: "messenger", label: "แมสเซนเจอร์" }, { key: "pickup", label: "รับที่ร้าน" }];
  const method = modes.some(mode => mode.key === value.method) ? value.method : modes[0].key;
  const plan = value.start ? planFor(settings, value.start, value.end || value.start, method, value.returnMethod) : null;
  const span: string[] = [];
  if (plan) for (let day = plan.ship; day < plan.ready; day = addDays(day, 1)) span.push(day);
  // Days held only by someone who has not paid yet can still be requested, as a waiting-list request.
  const full = span.filter(day => (left[day] ?? 1) < 1 && !waitable[day]), queued = span.filter(day => (left[day] ?? 1) < 1 && waitable[day]);
  const tooSoon = !!plan && !!today && plan.ship < today;
  const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
  // Yellow is the gap colour on this calendar, so any free day is plain green.
  const status = (day: string) => left[day] === undefined ? "unknown" : left[day] < 1 ? waitable[day] ? "waitlist" : "full" : "available";
  function pick(day: string) {
    if (!value.start || value.end || day < value.start) onChange({ ...value, method, start: day, end: "" });
    else onChange({ ...value, method, end: day });
  }

  return <div className="product-calendar">
    <div className="product-calendar-options">
      <span>รับชุด</span><div role="radiogroup" aria-label="วิธีรับชุด">{modes.map(mode => <button key={mode.key} type="button" role="radio" aria-checked={method === mode.key} className={method === mode.key ? "is-active" : ""} onClick={() => onChange({ ...value, method: mode.key })}>{mode.label}</button>)}</div>
      <span>คืนชุด</span><div role="radiogroup" aria-label="วิธีคืนชุด">{returnMethods.map(item => <button key={item.key} type="button" role="radio" aria-checked={value.returnMethod === item.key} className={value.returnMethod === item.key ? "is-active" : ""} onClick={() => onChange({ ...value, method, returnMethod: item.key })}>{item.label}</button>)}</div>
    </div>
    <p className="product-calendar-hint">{!value.start ? "แตะวันเริ่มใช้งาน แล้วแตะวันใช้งานวันสุดท้าย" : !value.end ? `เริ่มใช้งาน ${long(value.start)} · แตะวันใช้งานวันสุดท้าย (หรือแตะวันเดิมถ้าใช้ 1 วัน)` : `ใช้งาน ${long(value.start)} – ${long(value.end)}`}</p>
    <div className="calendar-toolbar"><button type="button" aria-label="เดือนก่อน" disabled={monthKey(month) <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevronLeft" /></button><strong>{label}</strong><button type="button" aria-label="เดือนถัดไป" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" /></button></div>
    <div className="calendar-grid" aria-busy={!loaded}>
      {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: month.getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: count }, (_, index) => {
        const day = `${monthKey(month)}-${String(index + 1).padStart(2, "0")}`;
        const past = day < today, role = plan ? dayRole(plan, day) : null, state = status(day);
        return <button key={day} type="button" disabled={past} onClick={() => pick(day)} aria-pressed={day === value.start || day === value.end}
          aria-label={`${index + 1} ${label} ${past ? "ผ่านไปแล้ว" : role ? dayRoleLabels[role] : state === "full" ? "เต็ม" : state === "waitlist" ? "มีคนจองไว้ชั่วคราว จองคิวสำรองได้" : "ว่าง"}`}
          className={`availability-${past ? "past" : state}${role ? ` role-${role}` : ""}${role && role !== "ready" && state === "full" ? " is-conflict" : ""}${day === value.start || day === value.end ? " selected" : ""}`}><b>{index + 1}</b>{!past && state !== "unknown" && <small>{left[day]} / {capacity[day]}</small>}</button>;
      })}
    </div>
    <div className="calendar-legend"><span className="legend-role-ship">● จัดส่ง</span><span className="legend-role-use">● ใช้งาน</span><span className="legend-role-return">● ส่งคืน</span><span className="legend-role-gap">● Gap</span><span className="legend-role-ready">● รับคิวใหม่ได้</span><span className="availability-legend-waitlist">● มีคนจองไว้ชั่วคราว</span><span className="availability-legend-full">● เต็ม</span></div>
    {plan && <>
      <RentalTimeline plan={plan} pickup={method === "pickup"} />
      {tooSoon ? <p className="product-calendar-alert">วิธีรับชุดนี้ร้านต้องเริ่มส่งตั้งแต่ {long(plan.ship)} ซึ่งผ่านไปแล้ว ลองเลือกแมสหรือรับที่ร้าน หรือเลื่อนวันเริ่มใช้งาน</p>
        : full.length ? <p className="product-calendar-alert">ช่วงนี้ต้องใช้ชุดตั้งแต่ {long(plan.ship)} ถึง {long(addDays(plan.ready, -1))} (รวมวันจัดส่งและ Gap) แต่วันที่ {full.map(long).join(", ")} ไม่ว่าง ลองเลื่อนวันหรือสอบถามร้าน</p>
        : queued.length && value.end ? <p className="product-calendar-waitlist">วันที่ {queued.map(long).join(", ")} มีลูกค้าจองไว้ก่อนแต่ยังไม่ได้ชำระเงิน ส่งคำขอได้ในฐานะ<b>คิวสำรอง</b> ถ้าคนก่อนหน้าไม่ชำระภายใน 1 ชั่วโมง สิทธิ์จะเลื่อนมาที่คุณ</p>
        : value.end && <p className="product-calendar-ok">✓ ช่วงนี้ว่าง ส่งคำขอจองได้เลย ร้านจะยืนยันคิวอีกครั้ง</p>}
    </>}
  </div>;
}
