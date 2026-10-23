import type { Db } from "mongodb";
import { audit } from "@/lib/audit";
import { activeExtensions, type Extension } from "@/lib/extension";
import { recordBookingPayment, thaiDay } from "@/lib/finance";
import { paymentSlips, type PaymentSlip } from "@/lib/payment-slips";
import { accountMatches, nameMatches, type SlipCheck } from "@/lib/slip2go";
import { getStoreSettings } from "@/lib/store-settings";
import { thaiQrIds } from "@/lib/thai-qr";

type BookingDoc = { _id: string; name?: string; status: string; payment?: "unpaid" | "paid"; createdAt: Date; quote?: { rental?: number; deposit?: number; shipping?: number; accountName?: string; accountNumber?: string }; extensions?: Extension[] };
export const slipRobot = { name: "ตรวจสลิปอัตโนมัติ (Slip2Go)", username: "slip2go" };

// Turns Slip2Go's answer into the slip's outcome. A slip for at least the bill total, paid to one of the shop's
// accounts and never used before, marks the bill paid; anything else waits for the shop. Used when the customer
// attaches the slip and again when /api/cron/slips re-checks one the bank had no record of yet.
// `recheck` saves over a "checking" slip only while it is still checking, so a shop decision made meanwhile stands.
export async function settleSlip(db: Db, request: Request | null, slip: PaymentSlip, check: SlipCheck, recheck = false) {
  const bookings = db.collection<BookingDoc>("bookingRequests"), slips = await paymentSlips(db);
  const booking = await bookings.findOne({ _id: slip.bookingId }, { projection: { _id: 1, name: 1, status: 1, payment: 1, createdAt: 1, quote: 1, extensions: 1 } });
  if (!booking) return null;
  const extension = activeExtensions(booking.extensions).find(item => item.billToken === slip.billToken);
  const record: PaymentSlip = { ...slip, status: "review", reason: "" };
  delete record.recheckAt;
  if (!check.ok) Object.assign(record, { reason: check.reason, ...(check.raw ? { raw: check.raw } : {}) });
  else {
    Object.assign(record, { transRef: check.transRef, amount: check.amount, dateTime: check.dateTime, senderName: check.senderName, receiverName: check.receiverName, raw: check.raw });
    // The receiver may be a bank account, or for แม่มณี / K SHOP QRs the merchant or biller id inside the shop's QR.
    const shop = (await getStoreSettings()).rentalDocument.accounts;
    const accounts = [...shop, booking.quote || {}].map(account => ({ name: account.accountName || "", numbers: [account.accountNumber || "", ...("qrPayload" in account && account.qrPayload ? thaiQrIds(account.qrPayload) : [])].filter(Boolean) })).filter(account => account.name || account.numbers.length);
    const toShop = accounts.some(account => check.receiverAccounts.some(masked => account.numbers.some(number => accountMatches(masked, number))) || (check.receiverName && nameMatches(check.receiverName, account.name)));
    const used = await slips.findOne({ _id: { $ne: slip._id }, transRef: check.transRef, $or: [{ bookingId: { $ne: booking._id } }, { status: { $in: ["verified", "accepted"] } }] }, { projection: { bookingId: 1 } });
    const paidAt = check.dateTime ? new Date(check.dateTime) : null;
    record.reason = used ? `สลิปนี้เคยใช้แล้ว (${used.bookingId})`
      : !toShop ? `บัญชีผู้รับในสลิปไม่ตรงกับบัญชีร้าน (${check.receiverName || "ไม่ระบุชื่อ"})`
      : check.amount < slip.due ? `ยอดในสลิป ${check.amount.toLocaleString("th-TH")} บาท น้อยกว่ายอดที่ต้องชำระ ${slip.due.toLocaleString("th-TH")} บาท`
      : paidAt && paidAt.getTime() < new Date(booking.createdAt).getTime() - 3600000 ? "สลิปนี้โอนก่อนวันที่ส่งคำขอจอง"
      : "";
    if (!record.reason) record.status = "verified";
  }
  if (recheck) { if (!(await slips.replaceOne({ _id: slip._id, status: "checking" }, record)).modifiedCount) return null; }
  else await slips.insertOne(record);

  if (record.status === "verified") {
    const paidOn = thaiDay(record.dateTime ? new Date(record.dateTime) : new Date());
    // Only the request that flips the bill to paid books the income, so two slips sent at once cannot both count.
    const flipped = extension
      ? await bookings.updateOne({ _id: booking._id, status: { $ne: "cancelled" }, extensions: { $elemMatch: { id: extension.id, billToken: slip.billToken, status: "unpaid" } } }, { $set: { "extensions.$.status": "paid", "extensions.$.paidOn": new Date(`${paidOn}T12:00:00.000Z`), "extensions.$.paidByName": slipRobot.name, updatedAt: new Date(), updatedBy: slipRobot.username } })
      : await bookings.updateOne({ _id: booking._id, payment: { $ne: "paid" }, status: { $ne: "cancelled" } }, { $set: { payment: "paid", paidAt: new Date(`${paidOn}T12:00:00.000Z`), updatedAt: new Date(), updatedBy: slipRobot.username }, $unset: { slipReview: "" } });
    if (flipped.modifiedCount && !extension) {
      const amounts = await recordBookingPayment(db, booking, slipRobot, paidOn);
      await audit(request, null, { action: "booking.payment_confirmed", targetType: "booking", targetId: booking._id, actorEmail: slipRobot.name,
        summary: `ลูกค้าแนบสลิป ตรวจผ่าน Slip2Go${recheck ? " (ตรวจซ้ำ)" : ""} · ${record.amount} บาท · อ้างอิง ${record.transRef} · ค่าเช่า ${amounts.rental} · ค่าส่ง ${amounts.shipping} · เงินมัดจำ ${amounts.deposit} บาท`,
        changes: [{ field: "payment", before: "unpaid", after: "paid" }, { field: "paidOn", before: null, after: paidOn }] });
    }
    return record;
  }
  await bookings.updateOne({ _id: booking._id }, { $set: { slipReview: { at: record.createdAt, reason: record.reason, billToken: slip.billToken }, updatedAt: new Date() } });
  await audit(request, null, { action: "booking.slip_review", targetType: "booking", targetId: booking._id, actorEmail: recheck ? slipRobot.name : `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`, summary: `${recheck ? "ตรวจสลิปซ้ำแล้ว" : "ลูกค้าแนบสลิป"} รอร้านตรวจ: ${record.reason}` });
  return record;
}
