import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { deposits } from "@/lib/finance";
import { holdEnds, isFirm, isHeld, queueClashes } from "@/lib/availability-store";
import { lateDays } from "@/lib/late-returns";
import { thaiDay } from "@/lib/finance";
import type { RefundAccount } from "@/lib/refund-account";
import type { Extension, LateReturn } from "@/lib/extension";
import { permissionsOf } from "@/lib/permissions";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import type { ScheduleRecord } from "@/lib/schedule";
import type { BookingVerification } from "@/lib/identity";
import BookingRequests from "./booking-requests";
import "./bookings.css";
import { depositFor } from "@/lib/pricing";
import type { Adjustment } from "@/lib/adjustment";
import type { BookingPenalty } from "@/lib/penalty";

export const metadata = { title: "คำขอจอง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = { slipReview?: { at: Date; reason: string }; _id: string; status: string; name: string; phone: string; address: string; pin: string; note: string; discountCode?: string; method: string; start: string; end: string; days: number; deliveryFee: number; estimatedTotal: number | null; quote?: Partial<{ rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string }>; items: { id: number; name: string; sku: string; image: string; dailyRate: number | null; rentalPrice?: number | null; unitSku?: string; deposit?: number | null }[]; createdAt: Date; payment?: "unpaid" | "paid"; billToken?: string; lineUserId?: string; lineName?: string; lineSentAt?: Date; paidAt?: Date | null; shipment?: { carrier: string; trackingNumber: string; shippedAt: Date; byName: string }; returned?: { at: Date; condition: string; note: string; byName: string }; customerReturn?: { carrier: string; trackingNumber: string; at: Date; via?: "line" | "bill" }; returnReminderSentAt?: Date; lateNoticeSentAt?: Date; schedule?: ScheduleRecord; verification?: BookingVerification; refundAccount?: RefundAccount & { updatedAt: Date }; extensions?: Extension[]; penalties?: BookingPenalty[]; lateReturn?: LateReturn; adjustments?: Adjustment[]; holdUntil?: Date; waitlist?: { since: Date }; shipping?: { label: string; base: number | null; discount: number }; delivery?: { km?: number; fee?: number; inBill?: boolean; address?: string; error?: string } };
type Query = { id?: string | string[]; page?: string | string[]; status?: string | string[]; q?: string | string[]; period?: string | string[] };
const one = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
const pageSize = 20;
const validStatuses = new Set(["all", "new", "contacted", "confirmed", "cancelled", "refund", "late", "clash"]);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const iso = (value?: Date | null) => value ? new Date(value).toISOString() : "";
async function Content({ searchParams }: { searchParams: Promise<Query> }) {
  const admin = await pageAdmin("bookings");
  const params = await searchParams;
  const selected = one(params.id) || "";
  const requestedPage = Math.max(1, Number.parseInt(one(params.page) || "1", 10) || 1);
  const filter = validStatuses.has(one(params.status) || "all") ? one(params.status) || "all" : "all";
  const query = (one(params.q) || "").trim();
  const period = ["all", "7", "30"].includes(one(params.period) || "all") ? one(params.period) || "all" : "all";
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const bookingFilter: Record<string, unknown> = {};
  if (["new", "contacted", "confirmed", "cancelled"].includes(filter)) bookingFilter.status = filter;
  if (query) {
    const expression = new RegExp(escapeRegex(query), "i");
    bookingFilter.$or = [{ _id: expression }, { name: expression }, { phone: expression }, { "items.name": expression }, { "items.sku": expression }];
  }
  if (period !== "all") { const cutoff = new Date(); cutoff.setTime(cutoff.getTime() - Number(period) * 86400000); bookingFilter.createdAt = { $gte: cutoff }; }
  const statusCountFilter = { ...bookingFilter };
  delete statusCountFilter.status;
  if (filter === "refund") {
    const held = await deposits(db).find({ status: "held" }, { projection: { _id: 1 } }).toArray();
    bookingFilter._id = { $in: held.map(row => row._id) };
    bookingFilter.returned = { $exists: true };
    bookingFilter.status = { $ne: "cancelled" };
  }
  if (filter === "late") {
    const today = thaiDay();
    bookingFilter.status = "confirmed";
    bookingFilter.shipment = { $exists: true };
    bookingFilter.returned = { $exists: false };
    bookingFilter.customerReturn = { $exists: false };
    const lateClause = [{ "schedule.returnDate": { $lt: today } }, { schedule: { $exists: false }, end: { $lt: today } }];
    if (bookingFilter.$or) { bookingFilter.$and = [{ $or: bookingFilter.$or as object[] }, { $or: lateClause }]; delete bookingFilter.$or; } else bookingFilter.$or = lateClause;
  }
  const projection = { _id: 1, status: 1, name: 1, phone: 1, address: 1, pin: 1, note: 1, discountCode: 1, method: 1, start: 1, end: 1, days: 1, deliveryFee: 1, estimatedTotal: 1, quote: 1, items: 1, createdAt: 1, payment: 1, billToken: 1, lineUserId: 1, lineName: 1, lineSentAt: 1, paidAt: 1, shipment: 1, returned: 1, customerReturn: 1, returnReminderSentAt: 1, lateNoticeSentAt: 1, delivery: 1, shipping: 1, schedule: 1, verification: 1, refundAccount: 1, extensions: 1, penalties: 1, lateReturn: 1, adjustments: 1, holdUntil: 1, waitlist: 1, slipReview: 1 };
  if (filter === "clash") {
    const candidates = await bookings.find({ ...bookingFilter, status: { $ne: "cancelled" }, returned: { $exists: false } }, { projection: { _id: 1, name: 1, phone: 1, status: 1, createdAt: 1, start: 1, end: 1, schedule: 1, shipment: 1, returned: 1, payment: 1, holdUntil: 1, waitlist: 1, "verification.status": 1, "items.id": 1, "items.sku": 1, "items.name": 1, "items.unitSku": 1 } }).toArray();
    const clashRows = await queueClashes(db, candidates.map(row => ({ ...row, _id: String(row._id) })));
    bookingFilter._id = { $in: [...clashRows.keys()] };
  }
  const [total, statusRows] = await Promise.all([
    bookings.countDocuments(bookingFilter),
    bookings.aggregate<{ _id: string; count: number }>([{ $match: statusCountFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const statusCounts = Object.fromEntries(statusRows.map(row => [row._id, row.count]));
  const pageRows = await bookings.find(bookingFilter, { projection }).sort({ createdAt: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).toArray();
  const selectedRow = selected && !pageRows.some(row => String(row._id) === selected) ? await bookings.findOne({ _id: selected }, { projection }) : null;
  const rows = selectedRow ? [...pageRows, selectedRow] : pageRows;
  // Only open rentals need a piece picked; closed ones keep what was recorded.
  // Bookings confirmed before pieces were tracked get a suggested piece per item; it is saved once the admin ships.
  const [settings, depositRows] = await Promise.all([getStoreSettings(), deposits(db).find({ _id: { $in: rows.map(row => String(row._id)) } }).toArray()]);
  const today = thaiDay();
  // Each item's deposit as the shop sets it now (product, else its category), so an unsaved quote adds up current figures.
  const missing = [...new Set(rows.flatMap(row => row.items.map(item => item.id)))];
  const productDeposits = new Map(missing.length ? (await db.collection<{ id: number; deposit?: number | null; category?: string }>("products").find({ id: { $in: missing } }, { projection: { _id: 0, id: 1, deposit: 1, category: 1 } }).toArray()).map(product => [product.id, depositFor(product, settings.categoryDeposits)]) : []);
  for (const row of rows) row.items = row.items.map(item => ({ ...item, deposit: productDeposits.get(item.id) ?? 0 }));
  const depositById = new Map(depositRows.map(({ refund, ...row }) => [row._id, { amount: row.amount, status: row.status, receivedAt: iso(row.receivedAt), receivedByName: row.receivedByName, ...(refund ? { refund: { ...refund, date: iso(refund.date), at: iso(refund.at) } } : {}) }]));
  return <BookingRequests key={`${filter}:${query}:${period}:${currentPage}`} selected={selected} permissions={permissionsOf(admin)} unitChoices={{}} initial={rows.map(({ lineUserId, lineSentAt, paidAt, shipment, returned, customerReturn, returnReminderSentAt, lateNoticeSentAt, refundAccount, extensions, lateReturn, adjustments, slipReview, ...row }) => ({ ...row, ...(slipReview ? { slipReview: { at: iso(slipReview.at), reason: slipReview.reason } } : {}), ...(adjustments?.length ? { adjustments: adjustments.map(item => ({ ...item, createdAt: iso(item.createdAt as Date) })) } : {}), ...(lateReturn ? { lateReturn: { ...lateReturn, createdAt: iso(lateReturn.createdAt as Date) } } : {}), ...(lateNoticeSentAt ? { lateNoticeSentAt: iso(lateNoticeSentAt) } : {}), ...(["new", "contacted"].includes(row.status) && !isFirm(row) ? { hold: row.waitlist ? { kind: "waitlist" as const, until: "" } : isHeld(row) ? { kind: "held" as const, until: holdEnds(row)!.toISOString() } : { kind: "expired" as const, until: holdEnds(row)?.toISOString() || "" } } : {}), ...(lateDays(row, today) ? { lateDays: lateDays(row, today) } : {}), ...(extensions?.length ? { extensions: extensions.map(item => ({ ...item, createdAt: iso(item.createdAt as Date), ...(item.cancelledAt ? { cancelledAt: iso(item.cancelledAt as Date) } : {}) })) } : {}), ...(refundAccount ? { refundAccount: { bank: refundAccount.bank, accountName: refundAccount.accountName, accountNumber: refundAccount.accountNumber } } : {}), lineLinked: !!lineUserId, lineSentAt: iso(lineSentAt), paidAt: iso(paidAt), returnReminderSentAt: iso(returnReminderSentAt), ...(row.verification ? { verification: { ...row.verification, submittedAt: iso(row.verification.submittedAt as Date | undefined), reviewedAt: iso(row.verification.reviewedAt as Date | undefined), remindedAt: iso(row.verification.remindedAt as Date | undefined) } } : {}), ...(customerReturn ? { customerReturn: { carrier: customerReturn.carrier, trackingNumber: customerReturn.trackingNumber, at: iso(customerReturn.at), via: customerReturn.via } } : {}), ...(shipment ? { shipment: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, byName: shipment.byName, shippedAt: iso(shipment.shippedAt) } } : {}), ...(returned ? { returned: { condition: returned.condition, note: returned.note, byName: returned.byName, at: iso(returned.at) } } : {}), ...(depositById.has(String(row._id)) ? { deposit: depositById.get(String(row._id)) } : {}), _id: String(row._id), createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString() }))} finePerDay={settings.lateRates.lateFinePerDay} store={{ logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument }} page={currentPage} pageCount={pageCount} total={total} statusCounts={statusCounts} filter={filter} query={query} period={period} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Query> }) { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดคำขอจอง…</main>}><Content searchParams={searchParams} /></Suspense>; }
