import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { billDue, paymentSlips, recheckDelays, type PaymentSlip } from "@/lib/payment-slips";
import { imageType } from "@/lib/r2";
import { checkSlip, slip2goConfigured } from "@/lib/slip2go";
import { settleSlip } from "@/lib/slip-settle";
import { activeExtensions, type Extension } from "@/lib/extension";

type BookingDoc = { _id: string; name?: string; status: string; payment?: "unpaid" | "paid"; quote?: { rental?: number; deposit?: number; shipping?: number }; extensions?: Extension[] };
const maxBytes = 5 * 1024 * 1024, triesPerDay = 6;

// The customer attaches a transfer slip on the bill. Slip2Go reads it; a slip for at least the bill total, paid to
// one of the shop's accounts and never used before, marks the bill paid. Anything else is kept for the shop to check.
export async function POST(request: Request, ctx: RouteContext<"/api/bill/[token]/slip">) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  if (!slip2goConfigured()) return Response.json({ error: "ร้านยังไม่เปิดตรวจสลิปออนไลน์ กรุณาส่งสลิปทาง LINE" }, { status: 503 });
  const { token } = await ctx.params;
  if (!/^[\w-]{20,40}$/.test(token)) return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
  const file = (await request.formData().catch(() => null))?.get("slip");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "กรุณาแนบรูปสลิป" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer()), contentType = imageType(bytes);
  if (!contentType || bytes.length > maxBytes) return Response.json({ error: "สลิปต้องเป็นรูป JPG / PNG / WebP ขนาดไม่เกิน 5MB" }, { status: 400 });

  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ $or: [{ billToken: token }, { "extensions.billToken": token }] }, { projection: { _id: 1, name: 1, status: 1, payment: 1, quote: 1, extensions: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบรายการเช่านี้" }, { status: 404 });
  if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (!booking.quote) return Response.json({ error: "ร้านยังไม่ได้ส่งยอดชำระ กรุณารอบิลจากร้านก่อน" }, { status: 409 });
  const extension = activeExtensions(booking.extensions).find(item => item.billToken === token);
  if (extension ? extension.status === "paid" : booking.payment === "paid") return Response.json({ error: "รายการนี้ชำระเงินแล้ว" }, { status: 409 });
  const slips = await paymentSlips(db);
  const billFilter = extension ? { billToken: token } : { bookingId: booking._id, $or: [{ billToken: token }, { billToken: { $exists: false } }] };
  if (await slips.countDocuments({ ...billFilter, createdAt: { $gt: new Date(Date.now() - 86400000) } }) >= triesPerDay) return Response.json({ error: "แนบสลิปหลายครั้งเกินไป กรุณาส่งสลิปให้ร้านทาง LINE" }, { status: 429 });

  const due = extension ? extension.amount : billDue(booking.quote), check = await checkSlip(bytes, contentType);
  const record: PaymentSlip = { _id: randomUUID(), bookingId: booking._id, billToken: token, contentType, size: bytes.length, data: new Binary(bytes), createdAt: new Date(), status: "review", reason: "", due };
  // The bank has no record of it yet (usually a slip sent within a minute of paying): /api/cron/slips asks again shortly.
  if (!check.ok && check.retry) {
    await slips.insertOne({ ...record, status: "checking", reason: check.reason, ...(check.raw ? { raw: check.raw } : {}), rechecks: 0, recheckAt: new Date(Date.now() + recheckDelays[0]) });
    await audit(request, null, { action: "booking.slip_checking", targetType: "booking", targetId: booking._id, actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`, summary: `ลูกค้าแนบสลิป ระบบจะตรวจกับธนาคารซ้ำอัตโนมัติ: ${check.reason}` });
    return Response.json({ ok: true, status: "checking" });
  }
  const settled = await settleSlip(db, request, record, check);
  return settled?.status === "verified" ? Response.json({ ok: true, status: "verified" }) : Response.json({ ok: true, status: "review", reason: settled?.reason || record.reason });
}
