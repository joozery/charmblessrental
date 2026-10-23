import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { customers, creditEntries, expireCredits, syncCustomersFromBookings } from "@/lib/customer-credits";
import { database } from "@/lib/mongodb";
import CustomersManager from "./customers-manager";
import "./customers-layout.css";

export const metadata = { title: "ลูกค้าและเครดิต | Charm Bless", robots: { index: false, follow: false } };
async function Content() {
  await pageAdmin("bookings");
  const db = await database(); await syncCustomersFromBookings(db); await expireCredits(db);
  const rows = await customers(db).find({}).sort({ updatedAt: -1 }).limit(1000).toArray();
  const history = rows.length ? await creditEntries(db).find({ customerId: { $in: rows.map(row => row._id) } }).sort({ createdAt: -1 }).limit(5000).toArray() : [];
  return <CustomersManager initial={rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} initialCredits={history.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), ...(row.expiresAt ? { expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt) } : {}) }))} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดข้อมูลลูกค้า…</main>}><Content /></Suspense>;
}
