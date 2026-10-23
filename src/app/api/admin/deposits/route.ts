import { randomBytes, randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { audit } from "@/lib/audit";
import { lineConfigured, pushLine } from "@/lib/line";
import type { RefundAccount } from "@/lib/refund-account";
import type { LateReturn } from "@/lib/extension";
import { deposits, ledgerDate, transactions, validDay, type DepositRecord } from "@/lib/finance";
import { R2_PUBLIC_URL } from "@/lib/product-images";
import type { Extension } from "@/lib/extension";
import { requestOrigin } from "@/lib/request-origin";

const isEvidence = (value: unknown) => typeof value === "string" && value.startsWith(`${R2_PUBLIC_URL}/evidence/`) && /^[a-f0-9-]+\.(png|jpg|webp)$/.test(value.slice(`${R2_PUBLIC_URL}/evidence/`.length));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("deposits");
  if (auth.error) return auth.error;
  const admin = auth.admin;
  const body = await request.json().catch(() => null);
  if (body?.action === "penalty") return createPenaltyBill(request, body);
  if (!body || typeof body.bookingId !== "string" || body.bookingId.length > 100 || typeof body.refund !== "number" || !Number.isFinite(body.refund) || body.refund < 0 || !validDay(body.date) || typeof body.reason !== "string" || body.reason.length > 500 || typeof body.transferRef !== "undefined" && (typeof body.transferRef !== "string" || body.transferRef.length > 120) || !Array.isArray(body.evidence) || body.evidence.length > 5 || !body.evidence.every(isEvidence)) return Response.json({ error: "กรุณาตรวจสอบยอดคืน วันที่ เหตุผล และหลักฐาน" }, { status: 400 });
  const db = await database();
  const deposit = await deposits(db).findOne({ _id: body.bookingId });
  if (!deposit || deposit.status === "void") return Response.json({ error: "ไม่พบเงินมัดจำของรายการนี้ ต้องยืนยันชำระเงินก่อน" }, { status: 404 });
  if (deposit.status !== "held") return Response.json({ error: "บันทึกการคืนเงินมัดจำของรายการนี้แล้ว" }, { status: 409 });
  const bookings = db.collection<{ _id: string; returned?: unknown; lineUserId?: string; billToken?: string; refundAccount?: RefundAccount; lateReturn?: LateReturn }>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.bookingId }, { projection: { returned: 1, lineUserId: 1, billToken: 1, refundAccount: 1, lateReturn: 1 } });
  if (!booking?.returned) return Response.json({ error: "กรุณาบันทึกรับคืนสินค้าก่อนคืนเงินมัดจำ" }, { status: 409 });
  const refund = Math.round(body.refund * 100) / 100, deducted = Math.round((deposit.amount - refund) * 100) / 100, reason = body.reason.trim(), transferRef = typeof body.transferRef === "string" ? body.transferRef.trim() : "";
  if (deducted < 0) return Response.json({ error: "ยอดคืนต้องไม่เกินเงินมัดจำที่รับไว้" }, { status: 400 });
  if (deducted > 0 && !reason) return Response.json({ error: "คืนเงินไม่เต็มจำนวน กรุณาระบุเหตุผลที่หักเงิน" }, { status: 400 });
  if (refund > 0 && !body.evidence.length) return Response.json({ error: "กรุณาแนบหลักฐานการโอนคืนอย่างน้อย 1 รูป" }, { status: 400 });
  const by = admin.email || admin.username, now = new Date();
  const status: DepositRecord["status"] = deducted === 0 ? "refunded" : refund === 0 ? "forfeited" : "partial";
  const result = await deposits(db).updateOne({ _id: deposit._id, status: "held" }, { $set: { status, updatedAt: now, refund: { amount: refund, deducted, reason, ...(transferRef ? { transferRef } : {}), date: ledgerDate(body.date), evidence: body.evidence, at: now, by, byName: admin.name } } });
  if (!result.modifiedCount) return Response.json({ error: "มีผู้บันทึกการคืนเงินมัดจำรายการนี้ไปแล้ว" }, { status: 409 });
  // The withheld part becomes shop income (fines); the refunded part never touches the income ledger.
  if (deducted > 0) await transactions(db).insertOne({ _id: randomUUID(), type: "income", category: "ค่าปรับ", amount: deducted, date: ledgerDate(body.date), note: `หักเงินมัดจำ ${deposit.bookingId}: ${reason}`.slice(0, 300), createdAt: now, createdBy: by, createdByName: admin.name, bookingId: deposit.bookingId, source: "deposit" });
  await audit(request, admin, { action: "deposit.refund", targetType: "booking", targetId: deposit.bookingId, summary: deducted ? `คืนเงินมัดจำ ${money(refund)} บาท หัก ${money(deducted)} บาท (${reason})` : `คืนเงินมัดจำเต็มจำนวน ${money(refund)} บาท`, changes: [{ field: "depositStatus", before: "held", after: status }, { field: "refundAmount", before: null, after: refund }, { field: "deducted", before: null, after: deducted }] });
  // A late-return fine still owed is settled by what was withheld from the deposit (already booked as a fine above).
  if (booking.lateReturn?.status === "unpaid" && deducted >= booking.lateReturn.fine) await bookings.updateOne({ _id: booking._id, "lateReturn.status": "unpaid" }, { $set: { "lateReturn.status": "deposit", "lateReturn.paidOn": body.date, "lateReturn.paidByName": admin.name } });
  // Tell the customer on LINE, with the transfer slip when there is one.
  let lineNotified = false;
  if (booking.lineUserId && lineConfigured()) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: booking._id }, { $set: { billToken } });
    const account = booking.refundAccount, link = `${requestOrigin(request)}/bill/${billToken}`;
    const text = refund > 0
      ? `💸 ร้านโอนเงินมัดจำคืนให้แล้วค่ะ\nคำขอ ${deposit.bookingId}\nยอดคืน ${money(refund)} บาท${account ? ` เข้าบัญชี ${account.bank} •••${account.accountNumber.slice(-4)}` : ""}${deducted > 0 ? `\nหัก ${money(deducted)} บาท: ${reason}` : ""}\nดูรายละเอียด: ${link}\n\nขอบคุณที่ใช้บริการ Charm Bless นะคะ 💗`
      : `แจ้งเรื่องเงินมัดจำคำขอ ${deposit.bookingId} ค่ะ\nร้านหักเงินมัดจำทั้งหมด ${money(deducted)} บาท\nเหตุผล: ${reason}\nหากมีข้อสงสัย ทักแชทนี้ได้เลยค่ะ`;
    const slip = refund > 0 ? body.evidence[0] as string | undefined : undefined;
    try { await pushLine(booking.lineUserId, [{ type: "text", text }, ...(slip ? [{ type: "image" as const, originalContentUrl: slip, previewImageUrl: slip }] : [])]); lineNotified = true; } catch (error) { console.error("LINE deposit notice failed:", error); }
  }
  return Response.json({ lineNotified, deposit: { ...deposit, status, refund: { amount: refund, deducted, reason, ...(transferRef ? { transferRef } : {}), date: body.date, evidence: body.evidence, at: now.toISOString(), by, byName: admin.name } } });
}

async function createPenaltyBill(request: Request, body: { action?: string; bookingId?: unknown; amount?: unknown; reason?: unknown }) {
  const auth = await requireAdmin("deposits");
  if (auth.error) return auth.error;
  if (typeof body.bookingId !== "string" || body.bookingId.length > 100 || typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1000000 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return Response.json({ error: "กรุณากรอกยอดค่าปรับและเหตุผลให้ครบถ้วน" }, { status: 400 });
  const db = await database();
  const bookings = db.collection<{ _id: string; name?: string; lineUserId?: string; status: string; end: string; extensions?: Extension[] }>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.bookingId }, { projection: { _id: 1, name: 1, lineUserId: 1, status: 1, end: 1, extensions: 1 } });
  if (!booking || booking.status === "cancelled") return Response.json({ error: "ไม่พบรายการจองที่ใช้งานได้" }, { status: 404 });
  const now = new Date(), amount = Math.round(body.amount * 100) / 100, billToken = randomBytes(18).toString("base64url");
  const extension: Extension = { id: randomUUID(), fromEnd: booking.end, toEnd: booking.end, addedDays: 0, amount, status: "unpaid", createdAt: now, createdByName: auth.admin.name, billToken, dueAt: new Date(now.getTime() + 60 * 60 * 1000), chargeType: "penalty", note: body.reason.trim().slice(0, 500) };
  const result = await bookings.updateOne({ _id: booking._id }, { $push: { extensions: extension }, $set: { updatedAt: now } });
  if (!result.modifiedCount) return Response.json({ error: "สร้างบิลค่าปรับไม่สำเร็จ กรุณาลองใหม่" }, { status: 409 });
  await audit(request, auth.admin, { action: "booking.penalty_bill_created", targetType: "booking", targetId: booking._id, summary: `สร้างบิลค่าปรับ ${money(amount)} บาท · ${extension.note}`, changes: [{ field: "penaltyAmount", before: null, after: amount }, { field: "penaltyReason", before: null, after: extension.note }] });
  let lineNotified = false;
  if (booking.lineUserId && lineConfigured()) try { await pushLine(booking.lineUserId, [{ type: "text", text: `มีบิลค่าปรับเพิ่มเติมสำหรับคำขอ ${booking._id} ค่ะ\nยอด ${money(amount)} บาท\nเหตุผล: ${extension.note}\nกรุณาชำระภายใน 1 ชั่วโมง: ${requestOrigin(request)}/bill/${billToken}` }]); lineNotified = true; } catch (error) { console.error("LINE penalty notice failed:", error); }
  return Response.json({ extension, lineNotified });
}
