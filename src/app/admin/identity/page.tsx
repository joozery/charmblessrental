import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { can } from "@/lib/permissions";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import type { BookingVerification } from "@/lib/identity";
import IdentityManager, { type QueueRow } from "./identity-manager";
import "../rental-pricing/rental-pricing.css";

export const metadata = { title: "ยืนยันตัวตน | Charm Bless", robots: { index: false, follow: false } };
type BookingDoc = { _id: string; name: string; phone: string; status: string; start: string; schedule?: { ship: string }; verification: BookingVerification; returned?: object };

async function Content() {
  const admin = await pageAdmin("identity");
  const db = await database();
  const [settings, rows, categories] = await Promise.all([
    getStoreSettings(),
    db.collection<BookingDoc>("bookingRequests").find({ "verification.mode": "identity", status: { $ne: "cancelled" }, returned: { $exists: false } }, { projection: { _id: 1, name: 1, phone: 1, status: 1, start: 1, schedule: 1, verification: 1 } }).sort({ "schedule.ship": 1 }).limit(300).toArray(),
    db.collection("products").distinct("category", { active: { $ne: false } }),
  ]);
  const queue: QueueRow[] = rows.map(row => ({ id: row._id, name: row.name, phone: `••• ${row.phone.slice(-4)}`, ship: row.schedule?.ship || row.start, status: row.verification.status }));
  return <IdentityManager queue={queue} initial={settings.verification} categories={categories.filter((value): value is string => typeof value === "string" && !!value).sort()} canEditSettings={can(admin, "settings")} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลด…</main>}><Content /></Suspense>;
}
