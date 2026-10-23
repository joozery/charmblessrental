import { Suspense } from "react";
import { Icon } from "@/components/ui/icon";
import { pageAdmin } from "@/lib/admin-auth";
import type { AdminAccount } from "@/lib/admin-accounts";
import type { Adjustment } from "@/lib/adjustment";
import { backfillBillOwners, type BillOwner } from "@/lib/bill-owner";
import { activeExtensions, type Extension } from "@/lib/extension";
import { database } from "@/lib/mongodb";
import CommissionTable, { type CommissionRow } from "./commission-table";
import "./commissions.css";

export const metadata = { title: "สรุปบิลตามแอดมิน | Charm Bless", robots: { index: false, follow: false } };

type Query = { month?: string | string[]; tab?: string | string[] };
type BookingDoc = { _id: string; name?: string; status: string; payment?: "unpaid" | "paid"; paidAt?: Date | null; createdAt: Date; billOwner?: BillOwner; extensions?: Extension[]; adjustments?: Adjustment[]; quote?: { rental?: number; deposit?: number; shipping?: number; discountAmount?: number; updatedAt?: Date } };
const one = (value?: string | string[]) => Array.isArray(value) ? value[0] : value || "";
const monthLabel = (month: string) => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const shiftMonth = (month: string, by: number) => { const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); return date.toISOString().slice(0, 7); };

async function Commissions({ searchParams }: { searchParams: Promise<Query> }) {
  const admin = await pageAdmin("finance");
  const query = await searchParams;
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
  const month = /^\d{4}-\d{2}$/.test(one(query.month)) ? one(query.month) : thisMonth;
  const open = one(query.tab) === "open";
  const db = await database();
  await backfillBillOwners(db);
  // Paid bills count in the month they were paid; open bills are every priced bill still waiting for payment.
  const filter = open
    ? { status: { $ne: "cancelled" }, payment: { $ne: "paid" as const }, quote: { $exists: true } }
    : { status: { $ne: "cancelled" }, payment: "paid" as const, paidAt: { $gte: new Date(`${month}-01T00:00:00Z`), $lt: new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`) } };
  const [bookings, admins] = await Promise.all([
    db.collection<BookingDoc>("bookingRequests").find(filter, { projection: { _id: 1, name: 1, status: 1, payment: 1, paidAt: 1, createdAt: 1, billOwner: 1, extensions: 1, adjustments: 1, quote: 1 } }).sort(open ? { createdAt: -1 } : { paidAt: -1 }).toArray(),
    db.collection<AdminAccount>("admins").find({}, { projection: { _id: 1, name: 1, active: 1 } }).sort({ name: 1 }).toArray(),
  ]);
  const rows: CommissionRow[] = bookings.map(row => {
    // Rent the bill earned: the quoted rent after discount, plus paid extensions and fines, plus settled edit differences.
    const extras = activeExtensions(row.extensions).filter(item => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);
    const adjusted = (row.adjustments || []).filter(item => item.status === "paid" || item.status === "refunded").reduce((sum, item) => sum + item.amount, 0);
    const rental = row.quote?.rental || 0;
    return {
      id: row._id, customer: row.name || "", day: (row.paidAt || row.quote?.updatedAt || row.createdAt).toISOString(), paid: row.payment === "paid",
      ownerId: row.billOwner?.adminId || "", ownerName: row.billOwner?.name || "", reassignedBy: row.billOwner?.assignedByName || "",
      rental, discount: row.quote?.discountAmount || 0, extras, adjusted, shipping: row.quote?.shipping || 0, deposit: row.quote?.deposit || 0, total: rental + extras + adjusted,
    };
  });
  return <main className="admin-main commissions-page">
    <header className="commissions-header">
      <div><span className="commissions-eyebrow">ADMIN SALES</span><h1>สรุปบิลตามแอดมิน</h1><p>บิลของแต่ละแอดมินและยอดค่าเช่า ใช้คิดค่าคอมมิชชัน ผู้ทำบิลคือแอดมินที่บันทึกราคาในใบสรุปเป็นคนแรก หรือเปิดบิลจากหลังบ้าน</p></div>
      <nav className="commissions-tabs" aria-label="เลือกรายการ"><a href={`/admin/commissions?month=${month}`} className={open ? "" : "is-active"}>ชำระแล้ว</a><a href="/admin/commissions?tab=open" className={open ? "is-active" : ""}>ส่งบิลแล้ว รอชำระ</a></nav>
    </header>
    {!open && <nav className="commissions-month" aria-label="เลือกเดือน"><a href={`/admin/commissions?month=${shiftMonth(month, -1)}`} aria-label="เดือนก่อน"><Icon name="chevronLeft" /></a><strong>{monthLabel(month)}</strong>{month < thisMonth ? <a href={`/admin/commissions?month=${shiftMonth(month, 1)}`} aria-label="เดือนถัดไป"><Icon name="chevron" /></a> : <span />}<small>นับตามวันที่ชำระ</small></nav>}
    <CommissionTable key={`${open ? "open" : month}`} rows={rows} admins={admins.map(item => ({ id: String(item._id), name: item.name, active: item.active !== false }))} canAssign={admin.role === "owner"} fileName={open ? "บิลรอชำระ" : `บิลตามแอดมิน-${month}`} open={open} />
  </main>;
}

export default function Page({ searchParams }: { searchParams: Promise<Query> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดสรุปบิล…</main>}><Commissions searchParams={searchParams} /></Suspense>;
}
