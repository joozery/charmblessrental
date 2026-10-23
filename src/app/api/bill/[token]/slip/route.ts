import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { recordBookingPayment, thaiDay } from "@/lib/finance";
import { database } from "@/lib/mongodb";
import { billDue, paymentSlips, type PaymentSlip } from "@/lib/payment-slips";
import { imageType } from "@/lib/r2";
import { accountMatches, checkSlip, nameMatches, slip2goConfigured } from "@/lib/slip2go";
import { getStoreSettings } from "@/lib/store-settings";
import { thaiQrIds } from "@/lib/thai-qr";
import { activeExtensions, type Extension } from "@/lib/extension";

type BookingDoc = { _id: string; name?: string; status: string; payment?: "unpaid" | "paid"; createdAt: Date; quote?: { rental?: number; deposit?: number; shipping?: number; accountName?: string; accountNumber?: string }; extensions?: Extension[] };
const maxBytes = 5 * 1024 * 1024, triesPerDay = 6;
const robot = { name: "ตรวจสลิปอัตโนมัติ (Slip2Go)", username: "slip2go" };

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
  const booking = await bookings.findOne({ $or: [{ billToken: token }, { "extensions.billToken": token }] }, { projection: { _id: 1, name: 1, status: 1, payment: 1, createdAt: 1, quote: 1, extensions: 1 } });
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
  if (!check.ok) record.reason = check.reason;
  else {
    Object.assign(record, { transRef: check.transRef, amount: check.amount, dateTime: check.dateTime, senderName: check.senderName, receiverName: check.receiverName, raw: check.raw });
    // The receiver may be a bank account, or for แม่มณี / K SHOP QRs the merchant or biller id inside the shop's QR.
    const shop = (await getStoreSettings()).rentalDocument.accounts;
    const accounts = [...shop, booking.quote].map(account => ({ name: account.accountName || "", numbers: [account.accountNumber || "", ...("qrPayload" in account && account.qrPayload ? thaiQrIds(account.qrPayload) : [])].filter(Boolean) })).filter(account => account.name || account.numbers.length);
    const toShop = accounts.some(account => check.receiverAccounts.some(masked => account.numbers.some(number => accountMatches(masked, number))) || (check.receiverName && nameMatches(check.receiverName, account.name)));
    const used = await slips.findOne({ transRef: check.transRef, $or: [{ bookingId: { $ne: booking._id } }, { status: { $in: ["verified", "accepted"] } }] }, { projection: { bookingId: 1 } });
    const paidAt = check.dateTime ? new Date(check.dateTime) : null;
    record.reason = used ? `สลิปนี้เคยใช้แล้ว (${used.bookingId})`
      : !toShop ? `บัญชีผู้รับในสลิปไม่ตรงกับบัญชีร้าน (${check.receiverName || "ไม่ระบุชื่อ"})`
      : check.amount < due ? `ยอดในสลิป ${check.amount.toLocaleString("th-TH")} บาท น้อยกว่ายอดที่ต้องชำระ ${due.toLocaleString("th-TH")} บาท`
      : paidAt && paidAt.getTime() < new Date(booking.createdAt).getTime() - 3600000 ? "สลิปนี้โอนก่อนวันที่ส่งคำขอจอง"
      : "";
    if (!record.reason) record.status = "verified";
  }
  await slips.insertOne(record);

  if (record.status === "verified") {
    const paidOn = thaiDay(record.dateTime ? new Date(record.dateTime) : new Date());
    // Only the request that flips the bill to paid books the income, so two slips sent at once cannot both count.
    const flipped = extension
      ? await bookings.updateOne({ _id: booking._id, status: { $ne: "cancelled" }, extensions: { $elemMatch: { id: extension.id, billToken: token, status: "unpaid" } } }, { $set: { "extensions.$.status": "paid", "extensions.$.paidOn": new Date(`${paidOn}T12:00:00.000Z`), "extensions.$.paidByName": robot.name, updatedAt: new Date(), updatedBy: robot.username } })
      : await bookings.updateOne({ _id: booking._id, payment: { $ne: "paid" }, status: { $ne: "cancelled" } }, { $set: { payment: "paid", paidAt: new Date(`${paidOn}T12:00:00.000Z`), updatedAt: new Date(), updatedBy: robot.username } });
    if (flipped.modifiedCount && !extension) {
      const amounts = await recordBookingPayment(db, booking, robot, paidOn);
      await audit(request, null, { action: "booking.payment_confirmed", targetType: "booking", targetId: booking._id, actorEmail: robot.name,
        summary: `ลูกค้าแนบสลิป ตรวจผ่าน Slip2Go · ${check.ok ? check.amount : 0} บาท · อ้างอิง ${record.transRef} · ค่าเช่า ${amounts.rental} · ค่าส่ง ${amounts.shipping} · เงินมัดจำ ${amounts.deposit} บาท`,
        changes: [{ field: "payment", before: "unpaid", after: "paid" }, { field: "paidOn", before: null, after: paidOn }] });
    }
    return Response.json({ ok: true, status: "verified" });
  }
  await bookings.updateOne({ _id: booking._id }, { $set: { slipReview: { at: record.createdAt, reason: record.reason, billToken: token }, updatedAt: new Date() } });
  await audit(request, null, { action: "booking.slip_review", targetType: "booking", targetId: booking._id, actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`, summary: `ลูกค้าแนบสลิป รอร้านตรวจ: ${record.reason}` });
  return Response.json({ ok: true, status: "review", reason: record.reason });
}
