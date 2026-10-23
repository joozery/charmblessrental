import { Suspense } from "react";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { deposits, thaiDay } from "@/lib/finance";
import { clashGroups } from "@/lib/clash-groups";
import { headers } from "next/headers";
import { promoteWaitlist } from "@/lib/waitlist";
import { can, permissionsOf } from "@/lib/permissions";
import AdminChrome from "./admin-chrome";
import "./admin.css";
import "./admin-chrome.css";
async function Workspace({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) return children;
  const db = await database();
  // Opening any admin page also moves the waiting list on, so the counts below are current.
  const head = await headers();
  await promoteWaitlist(db, null, head.get("host") ? `${head.get("x-forwarded-proto") || "https"}://${head.get("host")}` : undefined);
  // Rentals back at the shop whose deposit is still held: the same count as the "รอคืนมัดจำ" filter on the bookings page.
  const awaitingRefund = async () => {
    const held = await deposits(db).find({ status: "held" }, { projection: { _id: 1 } }).toArray();
    return held.length ? db.collection<{ _id: string }>("bookingRequests").countDocuments({ _id: { $in: held.map(row => row._id) }, returned: { $exists: true }, status: { $ne: "cancelled" } }) : 0;
  };
  // Out with a customer past the return day, and the customer has not said it is on its way.
  const today = thaiDay();
  const overdue = () => db.collection("bookingRequests").countDocuments({ status: "confirmed", shipment: { $exists: true }, returned: { $exists: false }, customerReturn: { $exists: false }, $or: [{ "schedule.returnDate": { $lt: today } }, { schedule: { $exists: false }, end: { $lt: today } }] });
  const [products, admins, bookings, refunds, late, clashes] = await Promise.all([
    db.collection("products").countDocuments(),
    admin.role === "owner" ? db.collection("admins").countDocuments() : Promise.resolve(0),
    can(admin, "bookings") ? db.collection("bookingRequests").countDocuments({ status: "new" }) : Promise.resolve(0),
    can(admin, "bookings") ? awaitingRefund() : Promise.resolve(0),
    can(admin, "bookings") ? overdue() : Promise.resolve(0),
    can(admin, "bookings") ? clashGroups(db).then(groups => groups.length) : Promise.resolve(0),
  ]);
  return <AdminChrome user={{ name: admin.name, email: admin.email, username: admin.username, role: admin.role, permissions: permissionsOf(admin) }} counts={{ products, admins, bookings, refunds, late, clashes }}>{children}</AdminChrome>;
}
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดพื้นที่จัดการร้าน…</main>}><Workspace>{children}</Workspace></Suspense>;
}
