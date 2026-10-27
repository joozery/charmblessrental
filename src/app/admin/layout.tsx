import { Suspense } from "react";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { deposits, thaiDay } from "@/lib/finance";
import { clashGroups } from "@/lib/clash-groups";
import { headers } from "next/headers";
import { promoteWaitlist } from "@/lib/waitlist";
import { can, permissionsOf } from "@/lib/permissions";
import { getStoreSettings } from "@/lib/store-settings";
import { legacyToShipFilter, toShipFilter } from "@/lib/to-ship";
import { legacyShipFrom } from "@/lib/legacy-rentals";
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
  const [products, admins, bookings, refunds, late, clashes, slips, toShip, shipLate] = await Promise.all([
    db.collection("products").countDocuments(),
    admin.role === "owner" ? db.collection("admins").countDocuments() : Promise.resolve(0),
    can(admin, "bookings") ? db.collection("bookingRequests").countDocuments({ status: "new" }) : Promise.resolve(0),
    can(admin, "bookings") ? awaitingRefund() : Promise.resolve(0),
    can(admin, "bookings") ? overdue() : Promise.resolve(0),
    can(admin, "bookings") ? clashGroups(db).then(groups => groups.length) : Promise.resolve(0),
    // Slips Slip2Go could not pass, waiting for someone who can confirm payments.
    can(admin, "payments") ? db.collection("bookingRequests").countDocuments({ slipReview: { $exists: true }, payment: { $ne: "paid" }, status: { $ne: "cancelled" } }) : Promise.resolve(0),
    // Paid and waiting to go out: all of them, and those whose ship day is today or already past.
    // Old-sheet rentals due from legacyShipFrom go out from the same page.
    can(admin, "shipping") ? Promise.all([db.collection("bookingRequests").countDocuments(toShipFilter), db.collection("rentals").countDocuments(legacyToShipFilter(legacyShipFrom))]).then(([web, old]) => web + old) : Promise.resolve(0),
    can(admin, "shipping") ? Promise.all([db.collection("bookingRequests").countDocuments({ ...toShipFilter, $or: [{ "schedule.ship": { $lte: today } }, { schedule: { $exists: false }, start: { $lte: today } }] }), db.collection("rentals").countDocuments({ ...legacyToShipFilter(legacyShipFrom), shipDate: { $gte: new Date(`${legacyShipFrom}T00:00:00.000Z`), $lte: new Date(`${today}T00:00:00.000Z`) } })]).then(([web, old]) => web + old) : Promise.resolve(0),
  ]);
  // The shop logo replaces the star in the sidebar header once one is uploaded in store settings.
  const logoImage = (await getStoreSettings()).logoImage || "", logo = /^(https?:\/\/|\/[^/])/.test(logoImage) ? logoImage : "";
  return <AdminChrome user={{ name: admin.name, email: admin.email, username: admin.username, role: admin.role, permissions: permissionsOf(admin) }} counts={{ products, admins, bookings, refunds, late, clashes, slips, toShip, shipLate }} logo={logo}>{children}</AdminChrome>;
}
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดพื้นที่จัดการร้าน…</main>}><Workspace>{children}</Workspace></Suspense>;
}
