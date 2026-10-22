import { randomBytes, randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { audit } from "@/lib/audit";
import { lineConfigured, pushLine } from "@/lib/line";
import type { RefundAccount } from "@/lib/refund-account";
import { deposits, ledgerDate, transactions, validDay, type DepositRecord } from "@/lib/finance";
import { R2_PUBLIC_URL } from "@/lib/product-images";

const isEvidence = (value: unknown) => typeof value === "string" && value.startsWith(`${R2_PUBLIC_URL}/evidence/`) && /^[a-f0-9-]+\.(png|jpg|webp)$/.test(value.slice(`${R2_PUBLIC_URL}/evidence/`.length));
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("deposits");
  if (auth.error) return auth.error;
  const admin = auth.admin;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.bookingId !== "string" || body.bookingId.length > 100 || typeof body.refund !== "number" || !Number.isFinite(body.refund) || body.refund < 0 || !validDay(body.date) || typeof body.reason !== "string" || body.reason.length > 500 || !Array.isArray(body.evidence) || body.evidence.length > 5 || !body.evidence.every(isEvidence)) return Response.json({ error: "กรุณาตรวจสอบยอดคืน วันที่ เหตุผล และหลักฐาน" }, { status: 400 });
  const db = await database();
  const deposit = await deposits(db).findOne({ _id: body.bookingId });
  if (!deposit || deposit.status === "void") return Response.json({ error: "ไม่พบเงินมัดจำของรายการนี้ ต้องยืนยันชำระเงินก่อน" }, { status: 404 });
  if (deposit.status !== "held") return Response.json({ error: "บันทึกการคืนเงินมัดจำของรายการนี้แล้ว" }, { status: 409 });
  const bookings = db.collection<{ _id: string; returned?: unknown; lineUserId?: string; billToken?: string; refundAccount?: RefundAccount }>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.bookingId }, { projection: { returned: 1, lineUserId: 1, billToken: 1, refundAccount: 1 } });
  if (!booking?.returned) return Response.json({ error: "กรุณาบันทึกรับคืนสินค้าก่อนคืนเงินมัดจำ" }, { status: 409 });
  const refund = Math.round(body.refund * 100) / 100, deducted = Math.round((deposit.amount - refund) * 100) / 100, reason = body.reason.trim();
  if (deducted < 0) return Response.json({ error: "ยอดคืนต้องไม่เกินเงินมัดจำที่รับไว้" }, { status: 400 });
  if (deducted > 0 && !reason) return Response.json({ error: "คืนเงินไม่เต็มจำนวน กรุณาระบุเหตุผลที่หักเงิน" }, { status: 400 });
  if (refund > 0 && !body.evidence.length) return Response.json({ error: "กรุณาแนบหลักฐานการโอนคืนอย่างน้อย 1 รูป" }, { status: 400 });
  const by = admin.email || admin.username, now = new Date();
  const status: DepositRecord["status"] = deducted === 0 ? "refunded" : refund === 0 ? "forfeited" : "partial";
  const result = await deposits(db).updateOne({ _id: deposit._id, status: "held" }, { $set: { status, updatedAt: now, refund: { amount: refund, deducted, reason, date: ledgerDate(body.date), evidence: body.evidence, at: now, by, byName: admin.name } } });
  if (!result.modifiedCount) return Response.json({ error: "มีผู้บันทึกการคืนเงินมัดจำรายการนี้ไปแล้ว" }, { status: 409 });
  // The withheld part becomes shop income (fines); the refunded part never touches the income ledger.
  if (deducted > 0) await transactions(db).insertOne({ _id: randomUUID(), type: "income", category: "ค่าปรับ", amount: deducted, date: ledgerDate(body.date), note: `หักเงินมัดจำ ${deposit.bookingId}: ${reason}`.slice(0, 300), createdAt: now, createdBy: by, createdByName: admin.name, bookingId: deposit.bookingId, source: "deposit" });
  await audit(request, admin, { action: "deposit.refund", targetType: "booking", targetId: deposit.bookingId, summary: deducted ? `คืนเงินมัดจำ ${money(refund)} บาท หัก ${money(deducted)} บาท (${reason})` : `คืนเงินมัดจำเต็มจำนวน ${money(refund)} บาท`, changes: [{ field: "depositStatus", before: "held", after: status }, { field: "refundAmount", before: null, after: refund }, { field: "deducted", before: null, after: deducted }] });
  // Tell the customer on LINE, with the transfer slip when there is one.
  let lineNotified = false;
  if (booking.lineUserId && lineConfigured()) {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: booking._id }, { $set: { billToken } });
    const account = booking.refundAccount, link = `${new URL(request.url).origin}/bill/${billToken}`;
    const text = refund > 0
      ? `💸 ร้านโอนเงินมัดจำคืนให้แล้วค่ะ\nคำขอ ${deposit.bookingId}\nยอดคืน ${money(refund)} บาท${account ? ` เข้าบัญชี ${account.bank} •••${account.accountNumber.slice(-4)}` : ""}${deducted > 0 ? `\nหัก ${money(deducted)} บาท: ${reason}` : ""}\nดูรายละเอียด: ${link}\n\nขอบคุณที่ใช้บริการ Charm Bless นะคะ 💗`
      : `แจ้งเรื่องเงินมัดจำคำขอ ${deposit.bookingId} ค่ะ\nร้านหักเงินมัดจำทั้งหมด ${money(deducted)} บาท\nเหตุผล: ${reason}\nหากมีข้อสงสัย ทักแชทนี้ได้เลยค่ะ`;
    const slip = refund > 0 ? body.evidence[0] as string | undefined : undefined;
    try { await pushLine(booking.lineUserId, [{ type: "text", text }, ...(slip ? [{ type: "image" as const, originalContentUrl: slip, previewImageUrl: slip }] : [])]); lineNotified = true; } catch (error) { console.error("LINE deposit notice failed:", error); }
  }
  return Response.json({ lineNotified, deposit: { ...deposit, status, refund: { amount: refund, deducted, reason, date: body.date, evidence: body.evidence, at: now.toISOString(), by, byName: admin.name } } });
}
