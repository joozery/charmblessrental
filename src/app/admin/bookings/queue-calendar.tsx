"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { addDays } from "@/lib/schedule";

type QueueBooking = { id: string; name: string; confirmed: boolean; ship: string; start: string; end: string; returnDate: string; ready: string };
type Role = "ship" | "use" | "return" | "gap";
const roleLabels: Record<Role, string> = { ship: "จัดส่ง", use: "ใช้งาน", return: "คืน", gap: "พักชุด" };
const weekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const roleOf = (booking: QueueBooking, day: string): Role | null => day < booking.ship || day >= booking.ready ? null : day < booking.start ? "ship" : day <= booking.end ? "use" : day === booking.returnDate ? "return" : "gap";
const shiftMonth = (month: string, by: number) => { const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); return date.toISOString().slice(0, 7); };
const monthLabel = (month: string) => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

// One piece's queue for a month: who has it on each day, so the shop can see whether a rental can run longer.
// `preview` marks days an extension would add, before it is saved.
export default function QueueCalendar({ productId, label, highlight, preview, startMonth, onClose }: { productId: number; label: string; highlight?: string; preview?: { from: string; to: string } | null; startMonth: string; onClose: () => void }) {
  const [month, setMonth] = useState(startMonth.slice(0, 7));
  const [data, setData] = useState<{ key: string; days: { date: string; remaining: number }[]; bookings: QueueBooking[] } | null>(null);
  const [error, setError] = useState("");
  const key = `${productId}:${month}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/queue?productId=${productId}&month=${month}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "โหลดคิวไม่สำเร็จ"); setData({ key, ...result }); setError(""); })
      .catch(cause => { if (cause.name !== "AbortError") setError(cause instanceof Error ? cause.message : "โหลดคิวไม่สำเร็จ"); });
    return () => controller.abort();
  }, [productId, month, key]);
  const loaded = data?.key === key ? data : null;
  const first = `${month}-01`, offset = new Date(`${first}T12:00:00Z`).getUTCDay();
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => addDays(first, index))];
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog queue-dialog" aria-describedby={undefined}>
    <header className="queue-dialog-head"><div><span className="bookings-eyebrow">QUEUE</span><Dialog.Title>คิวของ {label}</Dialog.Title></div><Dialog.Close className="admin-dialog-close" aria-label="ปิดปฏิทินคิว"><Icon name="close" /></Dialog.Close></header>
    <div className="queue-dialog-nav"><button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="เดือนก่อน"><Icon name="chevronLeft" /></button><strong>{monthLabel(month)}</strong><button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="เดือนถัดไป"><Icon name="chevron" /></button></div>
    <ul className="queue-legend"><li className="is-use">ใช้งาน</li><li className="is-ship">จัดส่ง / คืน</li><li className="is-gap">พักชุด</li><li className="is-hold">กันคิวชั่วคราว</li>{preview && <li className="is-preview">วันที่จะเช่าต่อ</li>}{highlight && <li className="is-self">คำขอนี้</li>}</ul>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="queue-grid" aria-busy={!loaded}>
      {weekdays.map(name => <span key={name} className="queue-weekday">{name}</span>)}
      {cells.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} />;
        const remaining = loaded?.days.find(row => row.date === day)?.remaining;
        const entries = (loaded?.bookings || []).map(booking => ({ booking, role: roleOf(booking, day) })).filter((entry): entry is { booking: QueueBooking; role: Role } => !!entry.role);
        const previewing = !!preview && day >= preview.from && day < preview.to;
        return <div key={day} className={`queue-day${remaining === 0 ? " is-full" : ""}${previewing ? " is-preview" : ""}`}>
          <span className="queue-day-head"><b>{Number(day.slice(8))}</b>{remaining !== undefined && <small>{remaining > 0 ? `ว่าง ${remaining}` : "เต็ม"}</small>}</span>
          {entries.map(({ booking, role }) => <Link key={booking.id} href={`/admin/bookings?id=${encodeURIComponent(booking.id)}`} onClick={onClose} className={`queue-chip is-${role}${booking.confirmed ? "" : " is-hold"}${booking.id === highlight ? " is-self" : ""}`} title={`${booking.id} · ${booking.name} · ${roleLabels[role]}${booking.confirmed ? "" : " (กันคิวชั่วคราว)"}`}>{booking.name || booking.id.slice(-6)}</Link>)}
        </div>;
      })}
    </div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
