import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import BookingRequests from "./booking-requests";
import "./bookings.css";

export const metadata = { title: "คำขอจอง | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = { _id: string; status: string; name: string; phone: string; address: string; pin: string; note: string; method: string; start: string; end: string; days: number; deliveryFee: number; estimatedTotal: number | null; quote?: Partial<{ rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string }>; items: { id: number; name: string; sku: string; image: string; dailyRate: number | null }[]; createdAt: Date; payment?: "unpaid" | "paid"; billToken?: string; lineUserId?: string; lineName?: string; lineSentAt?: Date };
async function Content() {
  if (!await currentAdmin()) redirect("/admin/login");
  const rows = await (await database()).collection<BookingDoc>("bookingRequests").find({}, { projection: { _id: 1, status: 1, name: 1, phone: 1, address: 1, pin: 1, note: 1, method: 1, start: 1, end: 1, days: 1, deliveryFee: 1, estimatedTotal: 1, quote: 1, items: 1, createdAt: 1, payment: 1, billToken: 1, lineUserId: 1, lineName: 1, lineSentAt: 1 } }).sort({ createdAt: -1 }).limit(500).toArray();
  const settings = await getStoreSettings();
  return <BookingRequests initial={rows.map(({ lineUserId, lineSentAt, ...row }) => ({ ...row, lineLinked: !!lineUserId, lineSentAt: lineSentAt ? new Date(lineSentAt).toISOString() : "", _id: String(row._id), createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString() }))} store={{ logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument }} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดคำขอจอง…</main>}><Content /></Suspense>; }
