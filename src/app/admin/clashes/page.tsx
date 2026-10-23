import { Suspense } from "react";
import Link from "next/link";
import { pageAdmin } from "@/lib/admin-auth";
import { clashGroups } from "@/lib/clash-groups";
import { database } from "@/lib/mongodb";
import "./clashes.css";

export const metadata = { title: "คิวทับซ้อน | Charm Bless", robots: { index: false, follow: false } };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const statusLabel: Record<string, string> = { new: "ใหม่ (กันคิว)", contacted: "ติดต่อแล้ว (กันคิว)", confirmed: "ยืนยันแล้ว" };

// Bookings that hold the same piece on the same days beyond what the shop owns, so the admin can sort them out in one place.
async function Content() {
  await pageAdmin("bookings");
  const groups = await clashGroups(await database());
  return <main className="admin-main clashes-page">
    <header className="clashes-header"><span className="clashes-eyebrow">QUEUE CLASHES</span><h1>คิวทับซ้อน</h1><p>รายการที่มีคนจองชุดเดียวกันในวันเดียวกันเกินจำนวนชุดที่มี เช่น ขยายวันทับคิวคนถัดไป หรือคืนช้า แก้ได้โดยสลับชิ้น เลื่อนวัน หรือยกเลิกคิวใดคิวหนึ่ง รายการจะหายเองเมื่อไม่ซ้อนแล้ว</p></header>
    {groups.length ? <div className="clashes-list">{groups.map(group => <article key={group.key} className="clashes-card">
      <header><strong>{group.item}</strong><span>ซ้อน {group.from === group.to ? day(group.from) : `${day(group.from)} – ${day(group.to)}`}</span></header>
      <ul>{group.bookings.map(booking => <li key={booking.id}>
        <Link href={`/admin/bookings?id=${encodeURIComponent(booking.id)}`}><b>{booking.name || "ไม่ระบุชื่อ"}</b> {booking.id}</Link>
        <small>{statusLabel[booking.status] || booking.status}{booking.shipped ? " · ส่งชุดแล้ว" : ""} · ใช้ชุด {day(booking.ship)} – {day(booking.ready)} (รวมส่งและพักชุด){booking.phone ? ` · ☎ ${booking.phone}` : ""}</small>
      </li>)}</ul>
    </article>)}</div> : <section className="clashes-empty">✅ ไม่มีคิวทับซ้อน</section>}
  </main>;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังตรวจคิว…</main>}><Content /></Suspense>; }
