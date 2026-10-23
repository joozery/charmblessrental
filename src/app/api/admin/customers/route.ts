import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { customers, grantCredit, expireCredits, creditEntries, syncCustomersFromBookings } from "@/lib/customer-credits";
import { database } from "@/lib/mongodb";

export async function GET() {
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const db = await database();
  await syncCustomersFromBookings(db); await expireCredits(db);
  const rows = await customers(db).find({}).sort({ updatedAt: -1 }).limit(1000).toArray();
  const ids = rows.map(row => row._id);
  const history = ids.length ? await creditEntries(db).find({ customerId: { $in: ids } }).sort({ createdAt: -1 }).limit(5000).toArray() : [];
  return Response.json({ customers: rows, credits: history });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (body?.action === "discountProfile") {
    if (typeof body.customerId !== "string" || !Number.isInteger(body.bookingCount) || body.bookingCount < 0 || !Number.isInteger(body.reviewCount) || body.reviewCount < 0) return Response.json({ error: "จำนวนครั้งไม่ถูกต้อง" }, { status: 400 });
    const db = await database(); const customer = await customers(db).findOne({ _id: body.customerId }); if (!customer) return Response.json({ error: "ไม่พบลูกค้า" }, { status: 404 });
    await customers(db).updateOne({ _id: customer._id }, { $set: { bookingCount: body.bookingCount, completedCount: body.bookingCount, reviewCount: body.reviewCount, updatedAt: new Date() } });
    await audit(request, auth.admin, { action: "customer.discount_profile", targetType: "customer", targetId: customer._id, summary: `แก้ประวัติลูกค้าเพื่อคำนวณส่วนลด · เช่า ${body.bookingCount} ครั้ง · รีวิว ${body.reviewCount} ครั้ง` });
    return Response.json({ ok: true });
  }
  if (!body || typeof body.customerId !== "string" || typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1000000 || typeof body.reason !== "string" || !body.reason.trim() || (body.bookingId !== undefined && (typeof body.bookingId !== "string" || body.bookingId.length > 100))) return Response.json({ error: "กรุณาตรวจสอบยอดเครดิตและเหตุผล" }, { status: 400 });
  const db = await database();
  const customer = await customers(db).findOne({ _id: body.customerId });
  if (!customer) return Response.json({ error: "ไม่พบลูกค้า" }, { status: 404 });
  await expireCredits(db, customer._id);
  let billToken: string | undefined;
  if (body.bookingId) {
    const booking = await db.collection<{ _id: string; billToken?: string }>("bookingRequests").findOne({ _id: body.bookingId }, { projection: { _id: 1, billToken: 1 } });
    if (!booking) return Response.json({ error: "ไม่พบบิลที่ผูกกับเครดิต" }, { status: 404 });
    billToken = booking.billToken;
  }
  const id = await grantCredit(db, { customerId: customer._id, amount: body.amount, reason: body.reason.trim(), ...(body.bookingId ? { bookingId: body.bookingId } : {}), ...(billToken ? { billToken } : {}), createdBy: auth.admin.email || auth.admin.username, createdByName: auth.admin.name });
  await audit(request, auth.admin, { action: "customer.credit", targetType: "customer", targetId: customer._id, summary: `เพิ่มเครดิต ${body.amount} บาท · ${body.reason.trim()}`, changes: [{ field: "creditBalance", before: customer.creditBalance, after: customer.creditBalance + body.amount }] });
  return Response.json({ ok: true, id });
}
