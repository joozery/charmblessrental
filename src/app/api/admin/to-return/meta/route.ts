import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { thaiDay } from "@/lib/finance";
import { legacyRentals } from "@/lib/legacy-rentals";
import { toReturnFilter } from "@/lib/to-return";

export async function GET(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;
  const url = new URL(request.url), query = (url.searchParams.get("q") || "").trim(), tab = url.searchParams.get("tab") || "all", today = thaiDay();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const webClauses: Record<string, unknown>[] = [], legacyClauses: Record<string, unknown>[] = [];
  if (query) {
    webClauses.push({ $or: [{ _id: { $regex: query, $options: "i" } }, { name: { $regex: query, $options: "i" } }, { phone: { $regex: query, $options: "i" } }, { "items.name": { $regex: query, $options: "i" } }, { "items.sku": { $regex: query, $options: "i" } }] });
    legacyClauses.push({ $or: [{ legacyId: { $regex: query, $options: "i" } }, { customerName: { $regex: query, $options: "i" } }, { phone: { $regex: query, $options: "i" } }] });
  }
  if (tab === "late") { webClauses.push({ $or: [{ "schedule.returnDate": { $lt: today } }, { schedule: { $exists: false }, end: { $lt: today } }] }); legacyClauses.push({ returnDate: { $lt: new Date(`${today}T00:00:00.000Z`) } }); }
  if (tab === "today") { webClauses.push({ $or: [{ "schedule.returnDate": { $lte: tomorrow } }, { schedule: { $exists: false }, end: { $lte: tomorrow } }] }); legacyClauses.push({ returnDate: { $lte: new Date(`${tomorrow}T23:59:59.999Z`) } }); }
  if (tab === "later") { webClauses.push({ $or: [{ "schedule.returnDate": { $gt: tomorrow } }, { schedule: { $exists: false }, end: { $gt: tomorrow } }] }); legacyClauses.push({ returnDate: { $gt: new Date(`${tomorrow}T23:59:59.999Z`) } }); }
  const webFilter = webClauses.length ? { $and: [toReturnFilter, ...webClauses] } : toReturnFilter;
  const legacyBase = { shipment: { $exists: true }, returned: { $exists: false }, cancelled: { $exists: false }, legacyStatus: { $in: ["จัดส่งแล้ว", "เกินกำหนดส่ง"] } };
  const legacyFilter = legacyClauses.length ? { $and: [legacyBase, ...legacyClauses] } : legacyBase;
  const db = await database();
  const [bookings, legacy] = await Promise.all([db.collection("bookingRequests").countDocuments(webFilter), legacyRentals(db).countDocuments(legacyFilter)]);
  return Response.json({ total: bookings + legacy });
}
