import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { getProducts, productsByLegacyIds } from "@/lib/product-store";
import type { Product } from "@/lib/products";
import { webRentals } from "@/lib/web-rentals";
import RentalCalendar from "./rental-calendar";
import "./dashboard.css";

export const metadata = { title: "ภาพรวมร้าน | Charm Bless Admin", robots: { index: false, follow: false } };

type Rental = {
  legacyId: string; enteredAt?: Date | string | null; customerName?: string;
  shipDate?: Date | string | null; returnDate?: Date | string | null;
  legacyStatus?: string; total?: number | null;
  // Set on bookings from the new website (see web-rentals.ts), which carry their own items.
  web?: true; items?: { productName?: string; sku?: string; image?: string }[];
};
type RentalItem = { rentalId: string; productLegacyId?: string; productName?: string; sku?: string };
type PageQuery = { from?: string | string[]; to?: string | string[]; date?: string | string[]; status?: string | string[]; denied?: string | string[] };
const bangkokDay = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
const sourceDay = (value: Date | string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : "";
const nextDay = (day: string, offset: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const shortDate = (day: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const dateWithYear = (day: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const money = (amount: number | null | undefined) => amount == null ? "—" : `${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
const plain = (value: string | undefined) => value?.trim() || "—";
const validDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && sourceDay(`${value}T12:00:00Z`) === value;

async function Dashboard({ from, to, date, status, denied }: PageQuery) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  const today = bangkokDay(new Date());
  const legacyDate = validDay(date) ? date : undefined;
  const start = validDay(from) ? from : legacyDate || nextDay(today, -6);
  const end = validDay(to) ? to : legacyDate || today;
  const reversedRange = start > end;
  const inRange = (day: string) => !reversedRange && day >= start && day <= end;
  const rangeLabel = start === end ? dateWithYear(start) : `${start.slice(0, 4) === end.slice(0, 4) ? shortDate(start) : dateWithYear(start)} – ${dateWithYear(end)}`;
  const db = await database();
  const [imported, web, products] = await Promise.all([
    db.collection<Rental>("rentals").find({}, { projection: { _id: 0, legacyId: 1, enteredAt: 1, customerName: 1, shipDate: 1, returnDate: 1, legacyStatus: 1, total: 1 } }).toArray(),
    webRentals(db, today),
    getProducts(),
  ]);
  // Imported rentals from the old sheet plus bookings made on the website, counted and listed together.
  const rentals: Rental[] = [...imported, ...web].map(rental => rental.legacyStatus === "เกินกำหนดส่ง" ? { ...rental, legacyStatus: "คืนสินค้าเลยกำหนด" } : rental);
  const selectedStatus = typeof status === "string" && ["รอชำระเงิน", "รอจัดส่ง", "คืนสินค้าเลยกำหนด"].includes(status) ? status : "all";
  const statusTabs = [{ value: "all", label: "ทั้งหมด" }, { value: "รอชำระเงิน", label: "รอชำระเงิน" }, { value: "รอจัดส่ง", label: "รอจัดส่ง" }, { value: "คืนสินค้าเลยกำหนด", label: "คืนสินค้าเลยกำหนด" }];
  const entered = rentals.filter(r => inRange(bangkokDay(r.enteredAt)));
  const latestInStatus = entered.filter(r => selectedStatus === "all" || r.legacyStatus === selectedStatus);
  const latest = [...latestInStatus].sort((a, b) => new Date(b.enteredAt || 0).getTime() - new Date(a.enteredAt || 0).getTime()).slice(0, 6);
  const shipping = rentals.filter(r => inRange(sourceDay(r.shipDate))).sort((a, b) => sourceDay(a.shipDate).localeCompare(sourceDay(b.shipDate)));
  const returning = rentals.filter(r => inRange(sourceDay(r.returnDate))).sort((a, b) => sourceDay(a.returnDate).localeCompare(sourceDay(b.returnDate)));
  const pending = entered.filter(r => r.legacyStatus === "รอชำระเงิน");
  const calendarEnd = reversedRange ? start : end < nextDay(start, 30) ? end : nextDay(start, 30);
  const calendarStart = nextDay(start, -new Date(`${start}T12:00:00Z`).getUTCDay());
  const calendarGridEnd = nextDay(calendarEnd, 6 - new Date(`${calendarEnd}T12:00:00Z`).getUTCDay());
  const calendarDays: string[] = [];
  if (!reversedRange) for (let day = calendarStart; day <= calendarGridEnd; day = nextDay(day, 1)) calendarDays.push(day);
  const rangeSize = Math.max(1, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1);
  const todayWeekStart = nextDay(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
  const relevantIds = [...new Set([...latest, ...shipping, ...returning].filter(r => !r.web).map(r => r.legacyId))];
  const items = relevantIds.length ? await db.collection<RentalItem>("rentalItems").find({ rentalId: { $in: relevantIds } }, { projection: { _id: 0, rentalId: 1, productLegacyId: 1, productName: 1, sku: 1 } }).toArray() : [];
  const firstItem = new Map<string, RentalItem>();
  for (const item of items) if (!firstItem.has(item.rentalId)) firstItem.set(item.rentalId, item);
  const productByLegacy = await productsByLegacyIds(db, [...new Set(items.map(item => item.productLegacyId).filter((id): id is string => !!id))]);
  const productFor = (rental: Rental): Product | undefined => productByLegacy.get(firstItem.get(rental.legacyId)?.productLegacyId || "");
  const missingImage = products.filter(product => product.imageStatus === "missing-source" || !product.images?.[0]).length;
  const queue = [...shipping.map(rental => ({ rental, kind: "จัดส่ง" as const, day: sourceDay(rental.shipDate) })), ...returning.map(rental => ({ rental, kind: "คืน" as const, day: sourceDay(rental.returnDate) }))].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 5);
  const statusParams = new URLSearchParams({ from: start, to: end, status: "รอชำระเงิน" });

  return <main className="admin-main dashboard-page">
    {denied && <p className="admin-error" role="alert">บัญชีของคุณไม่มีสิทธิ์เข้าหน้านั้น กรุณาติดต่อเจ้าของร้านหากต้องการสิทธิ์เพิ่ม</p>}
    <header className="dashboard-header">
      <div><span className="dashboard-eyebrow">CHARM BLESS RENTAL · หลังบ้าน</span><h1>ภาพรวมร้าน</h1><p>ติดตามรายการเช่า การจัดส่ง และกำหนดคืนจากข้อมูลในระบบ</p></div>
      <form action="/admin" method="get" className="dashboard-date-form"><Icon name="calendar" /><label htmlFor="dashboard-from">จากวันที่</label><input id="dashboard-from" type="date" name="from" defaultValue={start} required /><label htmlFor="dashboard-to">ถึงวันที่</label><input id="dashboard-to" type="date" name="to" defaultValue={end} required />{selectedStatus !== "all" && <input type="hidden" name="status" value={selectedStatus} />}<button type="submit">แสดงข้อมูล</button></form>
    </header>
    {reversedRange && <p className="dashboard-range-error" role="alert">วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น กรุณาเลือกช่วงวันที่ใหม่</p>}

    <section className="dashboard-metrics" aria-label={`ตัวเลขภาพรวมช่วง ${rangeLabel}`}>
      <article className="dashboard-metric"><span className="dashboard-metric-icon is-pink"><Icon name="booking" /></span><div><span>รายการจองในช่วงที่เลือก</span><strong>{entered.length.toLocaleString("th-TH")}</strong><small>อิงวันที่ลงข้อมูลตามเวลาไทย</small></div></article>
      <article className="dashboard-metric"><span className="dashboard-metric-icon is-orange"><Icon name="payment" /></span><div><span>รอชำระเงินในช่วงที่เลือก</span><strong>{pending.length.toLocaleString("th-TH")}</strong><small>อิงวันที่ลงข้อมูลและสถานะเดิม</small></div></article>
      <article className="dashboard-metric"><span className="dashboard-metric-icon is-purple"><Icon name="delivery" /></span><div><span>นัดจัดส่งในช่วงที่เลือก</span><strong>{shipping.length.toLocaleString("th-TH")}</strong><small>อิงวันที่จัดส่งที่บันทึกไว้</small></div></article>
      <article className="dashboard-metric"><span className="dashboard-metric-icon is-blue"><Icon name="arrowLeft" /></span><div><span>ครบกำหนดคืนในช่วงที่เลือก</span><strong>{returning.length.toLocaleString("th-TH")}</strong><small>อิงวันที่คืนที่บันทึกไว้</small></div></article>
    </section>

    <div className="dashboard-content-grid">
      <div className="dashboard-main-column">
        <section className="dashboard-panel dashboard-bookings" aria-labelledby="latest-rentals-title">
          <div className="dashboard-panel-head"><div><span className="dashboard-kicker">RENTALS</span><h2 id="latest-rentals-title">รายการเช่าในช่วงที่เลือก</h2></div><span className="dashboard-meta">{rangeLabel} · เรียงตามวันที่ลงข้อมูล<span className="dashboard-mobile-hint"> · เลื่อนตารางได้</span></span></div>
          <nav className="dashboard-booking-tabs" aria-label="กรองรายการเช่าตามสถานะ">{statusTabs.map(tab => { const count = tab.value === "all" ? entered.length : entered.filter(r => r.legacyStatus === tab.value).length; const params = new URLSearchParams({ from: start, to: end }); if (tab.value !== "all") params.set("status", tab.value); return <Link key={tab.value} href={`/admin?${params.toString()}`} aria-current={selectedStatus === tab.value ? "page" : undefined} className={selectedStatus === tab.value ? "is-active" : ""}>{tab.label} <span>{count.toLocaleString("th-TH")}</span></Link>; })}</nav>
          <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>เลขที่รายการ</th><th>ลูกค้า</th><th>สินค้า</th><th>จัดส่ง – คืน</th><th>ยอดรวม</th><th>สถานะ</th></tr></thead><tbody>{latest.map(rental => { const product = productFor(rental); const item = firstItem.get(rental.legacyId), webItem = rental.items?.[0]; return <tr key={rental.legacyId}><td className="dashboard-rental-id">{rental.web ? <Link href={`/admin/bookings?id=${encodeURIComponent(rental.legacyId)}`}>{rental.legacyId}</Link> : rental.legacyId}{rental.web && <small className="dashboard-web-tag">เว็บ</small>}</td><td>{plain(rental.customerName)}</td><td><div className="dashboard-item-cell"><span className="dashboard-item-thumb">{webItem?.image ? <Image unoptimized src={webItem.image} alt="" width={38} height={42} /> : product?.images?.[0] && product.imageStatus !== "missing-source" ? <Image unoptimized src={product.images[0]} alt="" width={38} height={42} /> : <Icon name="image" />}</span><span>{webItem?.productName || item?.productName || product?.name || "ไม่พบรายการสินค้า"}{(rental.items?.length || 0) > 1 ? ` +${(rental.items?.length || 0) - 1}` : ""}</span></div></td><td className="dashboard-date-cell">{sourceDay(rental.shipDate) ? shortDate(sourceDay(rental.shipDate)) : "—"} – {sourceDay(rental.returnDate) ? shortDate(sourceDay(rental.returnDate)) : "—"}</td><td className="dashboard-money">{money(rental.total)}</td><td><span className={`dashboard-status-badge ${rental.legacyStatus === "รอชำระเงิน" ? "is-pending" : rental.legacyStatus === "รอจัดส่ง" || rental.legacyStatus === "คืนสินค้าเลยกำหนด" ? "is-shipping" : "is-other"}`}>{plain(rental.legacyStatus)}</span></td></tr>; })}</tbody></table>{!latest.length && <p className="dashboard-empty">ไม่มีรายการเช่าในช่วงวันที่และสถานะที่เลือก</p>}</div>
          <p className="dashboard-bookings-note">แสดง {latest.length.toLocaleString("th-TH")} รายการล่าสุดจาก {latestInStatus.length.toLocaleString("th-TH")} รายการในช่วงที่เลือก</p>
        </section>

      </div>

      <div className="dashboard-side-column">
        <section className="dashboard-panel dashboard-today" aria-labelledby="today-shipping-title"><div className="dashboard-panel-head"><div><span className="dashboard-kicker">DATE RANGE QUEUE</span><h2 id="today-shipping-title">คิวจัดส่ง–คืน {rangeLabel}</h2></div></div><div className="dashboard-queue-tabs"><span>จัดส่ง {shipping.length}</span><span>คืน {returning.length}</span></div><div className="dashboard-queue-list">{queue.map(({ rental, kind, day }) => <div className="dashboard-queue-row" key={`${kind}-${rental.legacyId}`}><span className={`dashboard-queue-mark ${kind === "คืน" ? "is-return" : ""}`} /><div><strong>{plain(rental.customerName)}</strong><small>{rental.legacyId} · {shortDate(day)}</small></div><span>{kind}</span></div>)}{!shipping.length && !returning.length && <p className="dashboard-empty">ไม่มีคิวจัดส่งหรือคืนสินค้าในช่วงที่เลือก</p>}</div>{shipping.length + returning.length > 5 && <p className="dashboard-queue-more">แสดงตัวอย่าง 5 จาก {shipping.length + returning.length} รายการ</p>}</section>
      </div>
    </div>
    <RentalCalendar days={calendarDays} start={start} end={end} today={today} rangeLabel={rangeLabel} rangeSize={rangeSize} todayWeekStart={todayWeekStart} rentals={[...new Map([...shipping, ...returning].map(rental => [rental.legacyId, rental])).values()].map(rental => ({ legacyId: rental.legacyId, customerName: rental.customerName, shipDate: rental.shipDate ? new Date(rental.shipDate).toISOString() : undefined, returnDate: rental.returnDate ? new Date(rental.returnDate).toISOString() : undefined, enteredAt: rental.enteredAt ? new Date(rental.enteredAt).toISOString() : undefined, legacyStatus: rental.legacyStatus, total: rental.total, items: rental.items || items.filter(item => item.rentalId === rental.legacyId).map(item => { const product = productByLegacy.get(item.productLegacyId || ""); return { productName: item.productName || product?.name, sku: item.sku || product?.sku, image: product?.imageStatus === "missing-source" ? undefined : product?.images?.[0] || product?.image || undefined }; }) }))} />
    <div className="dashboard-bottom-grid">
      <section className="dashboard-panel dashboard-review" aria-labelledby="review-title"><div className="dashboard-panel-head"><div><span className="dashboard-kicker">NEEDS ATTENTION</span><h2 id="review-title">รายการที่ควรตรวจสอบ</h2></div></div><Link href={`/admin?${statusParams.toString()}#latest-rentals-title`} className="dashboard-review-row"><span className="dashboard-review-icon is-orange"><Icon name="payment" /></span><div><strong>รอชำระเงิน {pending.length} รายการ</strong><small>ในช่วงวันที่เลือก ตามสถานะข้อมูลเดิม</small></div><Icon name="arrowRight" /></Link><Link href="/admin/products" className="dashboard-review-row"><span className="dashboard-review-icon is-pink"><Icon name="image" /></span><div><strong>สินค้าไม่มีรูปต้นฉบับ {missingImage} รายการ</strong><small>ตรวจข้อมูลในหน้าจัดการสินค้า</small></div><Icon name="arrowRight" /></Link></section>
      <section className="dashboard-panel dashboard-inventory" aria-labelledby="inventory-title"><div className="dashboard-panel-head"><div><span className="dashboard-kicker">INVENTORY</span><h2 id="inventory-title">ข้อมูลสินค้า</h2></div><Link href="/admin/products">จัดการสินค้า<Icon name="arrowRight" /></Link></div><div className="dashboard-inventory-count"><strong>{products.length.toLocaleString("th-TH")}</strong><span>รายการสินค้าในระบบ</span></div><div className="dashboard-inventory-foot"><span>{products.filter(p => p.imageStatus !== "missing-source" && !!p.images?.[0]).length.toLocaleString("th-TH")} รายการมีรูปต้นฉบับ</span><span>{missingImage} รายการไม่มีรูป</span></div></section>
    </div>
    <p className="dashboard-source-note">รวมรายการเช่าที่นำเข้าจากไฟล์เดิม และการจองจากเว็บ (ป้าย “เว็บ” กดเปิดหน้าคำขอจองได้) · สถานะของรายการนำเข้าเป็นสถานะเดิมตอนนำเข้า</p>
  </main>;
}

export default function Page({ searchParams }: { searchParams: Promise<PageQuery> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดภาพรวมร้าน…</main>}><DashboardFromQuery searchParams={searchParams} /></Suspense>;
}
async function DashboardFromQuery({ searchParams }: { searchParams: Promise<PageQuery> }) {
  return <Dashboard {...await searchParams} />;
}
