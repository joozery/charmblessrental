import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import FinanceTransactions from "./finance-transactions";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import "./finance.css";

export const metadata = { title: "สรุปการเงิน | Charm Bless", robots: { index: false, follow: false } };

type Query = { from?: string | string[]; to?: string | string[] };
type Rental = { legacyId: string; customerName?: string; enteredAt?: Date | null; paidAt?: Date | null; legacyStatus?: string; rentalTotal?: number | null; deposit?: number | null; shipping?: number | null; total?: number | null; bankId?: string; slips?: string[] };
type Summary = { count: number; rentalTotal: number; deposit: number; shipping: number; total: number; pendingCount: number; pendingTotal: number };
type Trend = { _id: string; total: number; count: number };
type FinanceTransaction = { _id: string; type: "income" | "expense"; category: string; amount: number; date: Date; note?: string; createdBy?: string };

const one = (value?: string | string[]) => Array.isArray(value) ? value[0] : value || "";
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`));
const amount = (value?: number | null) => `${(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
const dateLabel = (value?: Date | null) => value ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(value) : "—";
const dayLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const monthLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));

async function Finance({ searchParams }: { searchParams: Promise<Query> }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  const query = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = validDay(one(query.from)) ? one(query.from) : defaultFrom;
  const to = validDay(one(query.to)) ? one(query.to) : today;
  const reversed = from > to;
  const startDate = new Date(`${from}T00:00:00.000Z`);
  const endDate = new Date(`${nextDay(to)}T00:00:00.000Z`);
  const db = await database();
  const rentals = db.collection<Rental>("rentals");
  const match = reversed ? { _id: { $exists: false } } : { enteredAt: { $gte: startDate, $lt: endDate } };
  const paidMatch = reversed ? { _id: { $exists: false } } : { paidAt: { $gte: startDate, $lt: endDate } };
  const transactionMatch = reversed ? { _id: { $exists: false } } : { date: { $gte: startDate, $lt: endDate } };
  const [summaryResult, paidResult, trend, paidRows, pendingRows, transactionRows] = await Promise.all([
    rentals.aggregate<Summary>([
      { $match: match },
      { $group: { _id: null, count: { $sum: 1 }, rentalTotal: { $sum: { $ifNull: ["$rentalTotal", 0] } }, deposit: { $sum: { $ifNull: ["$deposit", 0] } }, shipping: { $sum: { $ifNull: ["$shipping", 0] } }, total: { $sum: { $ifNull: ["$total", 0] } }, pendingCount: { $sum: { $cond: [{ $eq: ["$legacyStatus", "รอชำระเงิน"] }, 1, 0] } }, pendingTotal: { $sum: { $cond: [{ $eq: ["$legacyStatus", "รอชำระเงิน"] }, { $ifNull: ["$total", 0] }, 0] } } } },
      { $project: { _id: 0 } },
    ]).next(),
    rentals.aggregate<{ count: number; total: number }>([
      { $match: paidMatch },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ["$total", 0] } } } },
      { $project: { _id: 0 } },
    ]).next(),
    rentals.aggregate<Trend>([
      { $match: match },
      { $group: { _id: { $dateToString: { format: (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 <= 31 ? "%Y-%m-%d" : "%Y-%m", date: "$enteredAt", timezone: "UTC" } }, total: { $sum: { $ifNull: ["$total", 0] } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    rentals.find(paidMatch, { projection: { _id: 0, legacyId: 1, customerName: 1, paidAt: 1, legacyStatus: 1, total: 1, bankId: 1, slips: 1 } }).sort({ paidAt: -1 }).limit(8).toArray(),
    rentals.find({ ...match, legacyStatus: "รอชำระเงิน" }, { projection: { _id: 0, legacyId: 1, customerName: 1, enteredAt: 1, total: 1 } }).sort({ enteredAt: -1 }).limit(8).toArray(),
    db.collection<FinanceTransaction>("financeTransactions").find(transactionMatch, { projection: { _id: 1, type: 1, category: 1, amount: 1, date: 1, note: 1, createdBy: 1 } }).sort({ date: -1, _id: -1 }).toArray(),
  ]);
  const summary = summaryResult || { count: 0, rentalTotal: 0, deposit: 0, shipping: 0, total: 0, pendingCount: 0, pendingTotal: 0 };
  const paid = paidResult || { count: 0, total: 0 };
  const maxTrend = Math.max(1, ...trend.map(row => row.total));
  const isDaily = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 <= 31;
  const breakdown = [
    { label: "ค่าเช่า", value: summary.rentalTotal, className: "is-rental", color: "#97718b" },
    { label: "เงินประกัน", value: summary.deposit, className: "is-deposit", color: "#d29b55" },
    { label: "ค่าจัดส่ง", value: summary.shipping, className: "is-shipping", color: "#5e9aba" },
  ];
  const breakdownTotal = breakdown.reduce((total, item) => total + Math.max(0, item.value || 0), 0);
  let pieOffset = 0;
  const pieSlices = breakdown.map(item => {
    const share = breakdownTotal ? Math.max(0, item.value || 0) / breakdownTotal * 100 : 0;
    const slice = { ...item, share, start: pieOffset, end: pieOffset + share };
    pieOffset += share;
    return slice;
  });
  const pieBackground = breakdownTotal
    ? `conic-gradient(${pieSlices.map(slice => `${slice.color} ${slice.start}% ${slice.end}%`).join(", ")})`
    : "conic-gradient(#e8ebef 0 100%)";

  return <main className="admin-main finance-page">
    <header className="finance-header"><div><span className="finance-eyebrow">FINANCIAL OVERVIEW</span><h1>สรุปการเงิน</h1><p>ภาพรวมยอดเช่า ยอดที่มีบันทึกชำระ และเงินประกันจากประวัติการเช่า</p></div><form className="finance-date-form" action="/admin/finance" method="get"><label>ตั้งแต่<input type="date" name="from" defaultValue={from} required /></label><span>ถึง</span><label>วันที่<input type="date" name="to" defaultValue={to} required /></label><button type="submit"><Icon name="calendar" />แสดงสรุป</button></form></header>
    {reversed && <p className="finance-error" role="alert">ช่วงวันที่ไม่ถูกต้อง กรุณาเลือกวันเริ่มต้นก่อนวันสิ้นสุด</p>}
    <div className="finance-period-label"><Icon name="calendar" />ช่วงวันที่ {dateLabel(startDate)} – {dateLabel(new Date(`${to}T12:00:00.000Z`))}<span>อิงวันที่ลงข้อมูล</span></div>
    <section className="finance-metrics" aria-label="ตัวเลขสรุปการเงิน">
      <article className="is-total"><span className="finance-metric-icon"><Icon name="payment" /></span><div><span>ยอดรวมตามรายการเช่า</span><strong>{amount(summary.total)}</strong><small>{summary.count.toLocaleString("th-TH")} รายการที่ลงข้อมูลในช่วงนี้</small></div></article>
      <article className="is-paid"><span className="finance-metric-icon"><Icon name="check" /></span><div><span>ยอดที่มีวันที่ชำระบันทึก</span><strong>{amount(paid.total)}</strong><small>{paid.count.toLocaleString("th-TH")} รายการ · กรองตามวันที่ชำระ</small></div></article>
      <article className="is-pending"><span className="finance-metric-icon"><Icon name="calendar" /></span><div><span>สถานะรอชำระเงิน</span><strong>{amount(summary.pendingTotal)}</strong><small>{summary.pendingCount.toLocaleString("th-TH")} รายการ · กรองตามวันที่ลงข้อมูล</small></div></article>
    </section>
    <FinanceTransactions initial={transactionRows.map(row => ({ ...row, _id: String(row._id), date: row.date.toISOString(), note: row.note || "" }))} today={today} />
    <div className="finance-main-grid">
      <section className="finance-panel finance-trend"><div className="finance-panel-head"><div><span className="finance-eyebrow">RENTAL VALUE</span><h2>ยอดรวมรายการเช่าตามช่วงเวลา</h2></div><span className="finance-panel-caption">{isDaily ? "รายวัน" : "รายเดือน"}</span></div>{trend.length ? <div className="finance-chart" role="img" aria-label="กราฟยอดรวมรายการเช่า"><div className="finance-chart-y"><span>{amount(maxTrend)}</span><span>{amount(maxTrend / 2)}</span><span>0 บาท</span></div><div className="finance-chart-bars">{trend.map(row => <div className="finance-chart-column" key={row._id} title={`${isDaily ? dayLabel(row._id) : monthLabel(row._id)} · ${amount(row.total)} · ${row.count} รายการ`}><div className="finance-chart-track"><span style={{ height: `${Math.max(3, row.total / maxTrend * 100)}%` }} /></div><small>{isDaily ? dayLabel(row._id) : monthLabel(row._id)}</small></div>)}</div></div> : <p className="finance-empty">ไม่มีรายการเช่าในช่วงวันที่นี้</p>}<p className="finance-panel-note">เป็นยอดตามข้อมูลที่ลงรายการ ไม่ใช่กำไรสุทธิ และรวมเงินประกันกับค่าจัดส่งไว้ด้วย</p></section>
      <section className="finance-panel finance-breakdown"><div className="finance-panel-head"><div><span className="finance-eyebrow">AMOUNT BREAKDOWN</span><h2>ส่วนประกอบยอดรวม</h2></div></div><div className="finance-breakdown-content"><div className="finance-pie" role="img" aria-label={`สัดส่วนยอดรวมองค์ประกอบ: ${pieSlices.map(slice => `${slice.label} ${slice.share.toFixed(1)} เปอร์เซ็นต์`).join(", ")}`} style={{ background: pieBackground }} /><div className="finance-breakdown-legend">{pieSlices.map(slice => <div className="finance-breakdown-row" key={slice.className}><span><i className={slice.className} />{slice.label}</span><strong>{slice.share.toFixed(1)}%<small>{amount(slice.value)}</small></strong></div>)}</div></div><div className="finance-breakdown-total"><span>รวมทั้งหมด</span><strong>{amount(summary.total)}</strong></div><p className="finance-panel-note">เงินประกันแยกจากรายได้ค่าเช่า เนื่องจากอาจต้องคืนให้ลูกค้าหลังจบการเช่า</p></section>
    </div>
    <div className="finance-tables-grid">
      <section className="finance-panel finance-list-panel"><div className="finance-panel-head"><div><span className="finance-eyebrow">PAYMENTS RECORDED</span><h2>รายการที่มีวันที่ชำระในช่วงนี้</h2></div><span className="finance-list-count">{paid.count.toLocaleString("th-TH")}</span></div>{paidRows.length ? <div className="finance-list">{paidRows.map(row => <article key={row.legacyId}><div><strong>{row.legacyId}</strong><span>{row.customerName || "ไม่ระบุชื่อลูกค้า"} · {dateLabel(row.paidAt)}</span></div><strong>{amount(row.total)}</strong></article>)}</div> : <p className="finance-empty">ไม่มีวันที่ชำระที่บันทึกในช่วงนี้</p>}<Link className="finance-list-link" href={`/admin/rentals?from=${from}&to=${to}`}>ดูประวัติการเช่า<Icon name="arrowRight" /></Link></section>
      <section className="finance-panel finance-list-panel"><div className="finance-panel-head"><div><span className="finance-eyebrow">PAYMENT FOLLOW-UP</span><h2>รายการสถานะรอชำระเงิน</h2></div><span className="finance-list-count is-warning">{summary.pendingCount.toLocaleString("th-TH")}</span></div>{pendingRows.length ? <div className="finance-list">{pendingRows.map(row => <article key={row.legacyId}><div><strong>{row.legacyId}</strong><span>{row.customerName || "ไม่ระบุชื่อลูกค้า"} · {dateLabel(row.enteredAt)}</span></div><strong>{amount(row.total)}</strong></article>)}</div> : <p className="finance-empty">ไม่มีรายการสถานะรอชำระในช่วงนี้</p>}<Link className="finance-list-link" href={`/admin/rentals?status=${encodeURIComponent("รอชำระเงิน")}&from=${from}&to=${to}`}>ดูรายการรอชำระทั้งหมด<Icon name="arrowRight" /></Link></section>
    </div>
    <p className="finance-source-note">ข้อมูลจากแท็บ “ข้อมูลการเช่า” · ยอดชำระคำนวณจากรายการที่มีวันที่ชำระบันทึกไว้ โดยไม่มีข้อมูลค่าใช้จ่ายและการคืนเงินประกันครบถ้วน จึงไม่แสดงกำไรสุทธิหรือยอดเงินสดคงเหลือ</p>
  </main>;
}

function nextDay(day: string) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }

export default function Page({ searchParams }: { searchParams: Promise<Query> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดสรุปการเงิน…</main>}><Finance searchParams={searchParams} /></Suspense>;
}
