import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { deposits } from "@/lib/finance";
import type { RefundAccount } from "@/lib/refund-account";
import { permissionsOf } from "@/lib/permissions";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import { assignUnits, unitChoices } from "@/lib/rental-units";
import type { ScheduleRecord } from "@/lib/schedule";
import type { BookingVerification } from "@/lib/identity";
import BookingRequests from "./booking-requests";
import "./bookings.css";

export const metadata = { title: "คำขอจอง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = { _id: string; status: string; name: string; phone: string; address: string; pin: string; note: string; method: string; start: string; end: string; days: number; deliveryFee: number; estimatedTotal: number | null; quote?: Partial<{ rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string }>; items: { id: number; name: string; sku: string; image: string; dailyRate: number | null; rentalPrice?: number | null; unitSku?: string }[]; createdAt: Date; payment?: "unpaid" | "paid"; billToken?: string; lineUserId?: string; lineName?: string; lineSentAt?: Date; paidAt?: Date | null; shipment?: { carrier: string; trackingNumber: string; shippedAt: Date; byName: string }; returned?: { at: Date; condition: string; note: string; byName: string }; customerReturn?: { carrier: string; trackingNumber: string; at: Date; via?: "line" | "bill" }; returnReminderSentAt?: Date; schedule?: ScheduleRecord; verification?: BookingVerification; refundAccount?: RefundAccount & { updatedAt: Date }; shipping?: { label: string; base: number | null; discount: number }; delivery?: { km?: number; fee?: number; inBill?: boolean; address?: string; error?: string } };
type Query = { id?: string | string[] };
const iso = (value?: Date | null) => value ? new Date(value).toISOString() : "";
async function Content({ searchParams }: { searchParams: Promise<Query> }) {
  const admin = await pageAdmin("bookings");
  const { id } = await searchParams;
  const db = await database();
  const rows = await db.collection<BookingDoc>("bookingRequests").find({}, { projection: { _id: 1, status: 1, name: 1, phone: 1, address: 1, pin: 1, note: 1, method: 1, start: 1, end: 1, days: 1, deliveryFee: 1, estimatedTotal: 1, quote: 1, items: 1, createdAt: 1, payment: 1, billToken: 1, lineUserId: 1, lineName: 1, lineSentAt: 1, paidAt: 1, shipment: 1, returned: 1, customerReturn: 1, returnReminderSentAt: 1, delivery: 1, shipping: 1, schedule: 1, verification: 1, refundAccount: 1 } }).sort({ createdAt: -1 }).limit(500).toArray();
  // Only open rentals need a piece picked; closed ones keep what was recorded.
  const open = rows.filter(row => row.status !== "cancelled" && !row.returned);
  // Bookings confirmed before pieces were tracked get a suggested piece per item; it is saved once the admin ships.
  const suggested = new Map(await Promise.all(open.filter(row => row.status === "confirmed" && row.items.some(item => !item.unitSku)).map(async row => [String(row._id), (await assignUnits(db, { ...row, _id: String(row._id) })).map(item => item.unitSku || "")] as const)));
  const [settings, depositRows, choices] = await Promise.all([getStoreSettings(), deposits(db).find({ _id: { $in: rows.map(row => String(row._id)) } }).toArray(), unitChoices(db, open.flatMap(row => row.items.map(item => item.id)))]);
  const depositById = new Map(depositRows.map(({ refund, ...row }) => [row._id, { amount: row.amount, status: row.status, receivedAt: iso(row.receivedAt), receivedByName: row.receivedByName, ...(refund ? { refund: { ...refund, date: iso(refund.date), at: iso(refund.at) } } : {}) }]));
  return <BookingRequests selected={typeof id === "string" ? id : ""} permissions={permissionsOf(admin)} unitChoices={Object.fromEntries(choices)} initial={rows.map(({ lineUserId, lineSentAt, paidAt, shipment, returned, customerReturn, returnReminderSentAt, refundAccount, ...row }) => ({ ...row, ...(refundAccount ? { refundAccount: { bank: refundAccount.bank, accountName: refundAccount.accountName, accountNumber: refundAccount.accountNumber } } : {}), lineLinked: !!lineUserId, lineSentAt: iso(lineSentAt), paidAt: iso(paidAt), returnReminderSentAt: iso(returnReminderSentAt), ...(row.verification ? { verification: { ...row.verification, submittedAt: iso(row.verification.submittedAt as Date | undefined), reviewedAt: iso(row.verification.reviewedAt as Date | undefined), remindedAt: iso(row.verification.remindedAt as Date | undefined) } } : {}), ...(suggested.has(String(row._id)) ? { suggestedUnits: suggested.get(String(row._id)) } : {}), ...(customerReturn ? { customerReturn: { carrier: customerReturn.carrier, trackingNumber: customerReturn.trackingNumber, at: iso(customerReturn.at), via: customerReturn.via } } : {}), ...(shipment ? { shipment: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, byName: shipment.byName, shippedAt: iso(shipment.shippedAt) } } : {}), ...(returned ? { returned: { condition: returned.condition, note: returned.note, byName: returned.byName, at: iso(returned.at) } } : {}), ...(depositById.has(String(row._id)) ? { deposit: depositById.get(String(row._id)) } : {}), _id: String(row._id), createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString() }))} store={{ logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument }} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Query> }) { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดคำขอจอง…</main>}><Content searchParams={searchParams} /></Suspense>; }
