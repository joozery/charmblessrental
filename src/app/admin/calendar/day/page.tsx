import Link from "next/link";
import { pageAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { productsByLegacyIds } from "@/lib/product-store";
import { webRentals, type WebRental } from "@/lib/web-rentals";
import { thaiDay } from "@/lib/finance";
import "../calendar.css";
import "./day.css";

export const instant = false;

type ImportedRental = { legacyId: string; customerName?: string; shipDate?: Date | string; returnDate?: Date | string; enteredAt?: Date | string; legacyStatus?: string; total?: number | null };
type RentalItem = { rentalId: string; productLegacyId?: string; productName?: string; sku?: string };
type DailyRental = { legacyId: string; customerName?: string; shipDate?: Date | string; returnDate?: Date | string; enteredAt?: Date | string; legacyStatus?: string; total?: number | null; items: { productName?: string; sku?: string; image?: string }[]; web?: true };
type Query = { date?: string | string[] };

const one = (value?: string | string[]) => Array.isArray(value) ? value[0] || "" : value || "";
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const dayOf = (value?: Date | string) => value ? new Date(value).toISOString().slice(0, 10) : "";
const dateLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const shortDate = (value?: Date | string) => { const day = dayOf(value); return day ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "—"; };
const statusLabel = (value?: string) => value || "ไม่ระบุสถานะ";
const eventLabel = (row: DailyRental, date: string) => {
  const ships = dayOf(row.shipDate) === date, returns = dayOf(row.returnDate) === date;
  if (ships && returns) return "กำหนดส่งและคืนวันนี้";
  if (returns) return "กำหนดส่งคืนวันนี้";
  if (ships) return "กำหนดส่งวันนี้";
  return statusLabel(row.legacyStatus);
};
const statusBadges = (row: DailyRental, date: string) => [eventLabel(row, date), ["รอชำระเงิน", "รอจัดส่ง"].includes(row.legacyStatus || "") ? row.legacyStatus : ""].filter((value, index, values) => !!value && values.indexOf(value) === index);

async function Content({ searchParams }: { searchParams: Promise<Query> }) {
  await pageAdmin("bookings");
  const requested = one((await searchParams).date), date = validDay(requested) ? requested : thaiDay();
  const from = new Date(`${date}T00:00:00.000Z`), to = new Date(`${date}T00:00:00.000Z`); to.setUTCDate(to.getUTCDate() + 1);
  const db = await database();
  const [imported, web] = await Promise.all([
    db.collection<ImportedRental>("rentals").find({ $or: [{ shipDate: { $gte: from, $lt: to } }, { returnDate: { $gte: from, $lt: to } }] }, { projection: { _id: 0, legacyId: 1, customerName: 1, shipDate: 1, returnDate: 1, enteredAt: 1, legacyStatus: 1, total: 1 } }).toArray(),
    webRentals(db, date).then(rows => rows.filter(row => dayOf(row.shipDate) === date || dayOf(row.returnDate) === date)),
  ]);
  const ids = imported.map(row => row.legacyId), itemRows = ids.length ? await db.collection<RentalItem>("rentalItems").find({ rentalId: { $in: ids } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const productByLegacy = await productsByLegacyIds(db, [...new Set(itemRows.map(item => item.productLegacyId).filter((id): id is string => !!id))]);
  const oldRows: DailyRental[] = imported.map(row => ({ ...row, items: itemRows.filter(item => item.rentalId === row.legacyId).map(item => { const product = productByLegacy.get(item.productLegacyId || ""); return { productName: item.productName || product?.name, sku: item.sku || product?.sku, image: product?.imageStatus === "missing-source" ? undefined : product?.images?.[0] || product?.image || undefined }; }) }));
  const rows: DailyRental[] = [...oldRows, ...web.map((row: WebRental) => ({ ...row, web: true as const }))].sort((a, b) => dayOf(a.shipDate).localeCompare(dayOf(b.shipDate)) || (a.legacyId || "").localeCompare(b.legacyId || ""));
  return <main className="admin-main calendar-day-page">
    <header className="calendar-day-header"><div><Link href={`/admin?from=${date}&to=${date}`} className="calendar-day-back">← กลับไปหน้าภาพรวม</Link><span className="calendar-day-eyebrow">DAILY QUEUE</span><h1>คิวเช่าวันที่ {dateLabel(date)}</h1><p>รวม {rows.length.toLocaleString("th-TH")} รายการจัดส่งหรือคืนสินค้าในวันนี้</p></div><div className="calendar-day-count"><strong>{rows.length.toLocaleString("th-TH")}</strong><span>คิวทั้งหมด</span></div></header>
    {rows.length ? <div className="calendar-day-list">{rows.map(row => <article key={row.legacyId} className="calendar-day-card">
      <div className="calendar-day-card-head"><div><span className="calendar-day-number">#{row.legacyId}</span><h2>{row.customerName || "ไม่ระบุชื่อลูกค้า"}</h2></div><div className="calendar-day-statuses">{statusBadges(row, date).map((label, index) => <span className={`calendar-day-status${index ? " is-secondary" : ""}`} key={label}>{label}</span>)}</div></div>
      <div className="calendar-day-info"><div><b>กำหนดการ</b><span>จัดส่ง {shortDate(row.shipDate)}</span><small>กำหนดคืน {shortDate(row.returnDate)}</small></div><div><b>ข้อมูลรายการ</b><span>{row.web ? "รายการจากเว็บไซต์" : "รายการเช่าเดิม"}</span><small>สร้างรายการ {shortDate(row.enteredAt)}</small></div></div>
      <div className="calendar-day-products"><b>รายการชุด ({row.items.length})</b><div>{row.items.length ? row.items.map((item, index) => <div key={`${row.legacyId}-${item.sku}-${index}`}><span>{item.image ? <img src={item.image} alt="" /> : <span className="calendar-day-product-placeholder">ชุด</span>}</span><p><strong>{item.sku || "ไม่มีรหัสชุด"}</strong><small>{item.productName || "ไม่ระบุชื่อชุด"}</small></p></div>) : <span className="calendar-day-no-items">ไม่มีรายละเอียดชุด</span>}</div></div>
      <div className="calendar-day-footer"><strong>{row.total == null ? "ไม่ระบุยอดรวม" : `${row.total.toLocaleString("th-TH")} บาท`}</strong>{row.web ? <Link href={`/admin/bookings?id=${encodeURIComponent(row.legacyId)}`}>ดูรายละเอียดและจัดการคิว →</Link> : <span>รายการนำเข้าจากข้อมูลเดิม</span>}</div>
    </article>)}</div> : <section className="calendar-day-empty"><strong>วันนี้ยังไม่มีคิว</strong><span>ไม่พบรายการจัดส่งหรือคืนสินค้าในวันที่เลือก</span></section>}
  </main>;
}

export default function Page({ searchParams }: { searchParams: Promise<Query> }) { return <Content searchParams={searchParams} />; }
