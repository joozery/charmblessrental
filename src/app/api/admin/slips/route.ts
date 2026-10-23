import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { recordBookingPayment, thaiDay } from "@/lib/finance";
import { database } from "@/lib/mongodb";
import { paymentSlips } from "@/lib/payment-slips";
import { activeExtensions, type Extension } from "@/lib/extension";

type BookingDoc = { _id: string; name?: string; status: string; payment?: "unpaid" | "paid"; quote?: { rental?: number; deposit?: number; shipping?: number }; extensions?: Extension[] };

// The slips a customer attached to one bill, newest first, without the image bytes.
export async function GET(request: Request) {
  const auth = await requireAdmin("payments");
  if (auth.error) return auth.error;
  const bookingId = new URL(request.url).searchParams.get("bookingId") || "";
  const rows = await (await paymentSlips(await database())).find({ bookingId }, { projection: { data: 0, raw: 0 } }).sort({ createdAt: -1 }).limit(20).toArray();
  return Response.json({ slips: rows });
}

// The shop's call on a slip Slip2Go could not pass: accepting it confirms the payment, rejecting tells the customer why.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !["accept", "reject"].includes(body.decision) || (body.decision === "reject" && (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 300))) return Response.json({ error: "กรุณาระบุเหตุผลที่สลิปไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin("payments");
  if (auth.error) return auth.error;
  const admin = auth.admin, db = await database(), slips = await paymentSlips(db);
  const slip = await slips.findOne({ _id: body.id }, { projection: { data: 0 } });
  if (!slip) return Response.json({ error: "ไม่พบสลิปนี้" }, { status: 404 });
  if (slip.status !== "review") return Response.json({ error: "สลิปนี้ตรวจไปแล้ว" }, { status: 409 });
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: slip.bookingId }, { projection: { _id: 1, name: 1, status: 1, payment: 1, quote: 1, extensions: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองของสลิปนี้" }, { status: 404 });
  const extension = slip.billToken ? activeExtensions(booking.extensions).find(item => item.billToken === slip.billToken) : null;
  const reviewed = { reviewedAt: new Date(), reviewedByName: admin.name };
  if (body.decision === "reject") {
    await slips.updateOne({ _id: slip._id }, { $set: { status: "rejected", reason: body.reason.trim(), ...reviewed } });
    await bookings.updateOne({ _id: booking._id }, { $unset: { slipReview: "" } });
    await audit(request, admin, { action: "booking.slip_rejected", targetType: "booking", targetId: booking._id, summary: `สลิปไม่ถูกต้อง: ${body.reason.trim()}` });
    return Response.json({ ok: true, status: "rejected", payment: booking.payment || "unpaid" });
  }
  if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (!extension && !booking.quote) return Response.json({ error: "กรุณาบันทึกราคาในใบสรุปก่อนยืนยันชำระเงิน" }, { status: 409 });
  await slips.updateOne({ _id: slip._id }, { $set: { status: "accepted", ...reviewed } });
  const paidOn = thaiDay(slip.dateTime ? new Date(slip.dateTime) : slip.createdAt);
  if (extension) {
    const updated = await bookings.updateOne({ _id: booking._id, extensions: { $elemMatch: { id: extension.id, billToken: extension.billToken, status: "unpaid" } } }, { $set: { "extensions.$.status": "paid", "extensions.$.paidOn": new Date(`${paidOn}T12:00:00.000Z`), "extensions.$.paidByName": admin.name, updatedAt: new Date(), updatedBy: admin.email || admin.username }, $unset: { slipReview: "" } });
    if (!updated.modifiedCount) return Response.json({ error: "บิลส่วนต่างนี้ชำระไปแล้วหรือถูกแก้ไข กรุณาโหลดหน้าใหม่" }, { status: 409 });
    await audit(request, admin, { action: "booking.extension_payment_confirmed", targetType: "booking", targetId: booking._id, summary: `ยืนยันชำระบิลส่วนต่างจากสลิป${slip.transRef ? ` · อ้างอิง ${slip.transRef}` : ""} · ${extension.amount} บาท`, changes: [{ field: "extension.payment", before: "unpaid", after: "paid" }] });
    return Response.json({ ok: true, status: "accepted", payment: "extension-paid", paidAt: `${paidOn}T12:00:00.000Z` });
  }
  const flipped = await bookings.updateOne({ _id: booking._id, payment: { $ne: "paid" } }, { $set: { payment: "paid", paidAt: new Date(`${paidOn}T12:00:00.000Z`), updatedAt: new Date(), updatedBy: admin.email || admin.username }, $unset: { slipReview: "" } });
  if (flipped.modifiedCount) {
    const amounts = await recordBookingPayment(db, booking, admin, paidOn);
    await audit(request, admin, { action: "booking.payment_confirmed", targetType: "booking", targetId: booking._id, summary: `ยืนยันชำระเงินจากสลิปที่ลูกค้าแนบ${slip.transRef ? ` · อ้างอิง ${slip.transRef}` : ""} · ค่าเช่า ${amounts.rental} · ค่าส่ง ${amounts.shipping} · เงินมัดจำ ${amounts.deposit} บาท`, changes: [{ field: "payment", before: "unpaid", after: "paid" }, { field: "paidOn", before: null, after: paidOn }] });
  } else await bookings.updateOne({ _id: booking._id }, { $unset: { slipReview: "" } });
  return Response.json({ ok: true, status: "accepted", payment: "paid", paidAt: `${paidOn}T12:00:00.000Z` });
}
