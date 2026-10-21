import { randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { audit } from "@/lib/audit";
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
  if (!deposit || deposit.status === "void") return Response.json({ error: "ไม่พบเงินประกันของรายการนี้ ต้องยืนยันชำระเงินก่อน" }, { status: 404 });
  if (deposit.status !== "held") return Response.json({ error: "บันทึกการคืนเงินประกันของรายการนี้แล้ว" }, { status: 409 });
  const booking = await db.collection<{ _id: string; returned?: unknown }>("bookingRequests").findOne({ _id: body.bookingId }, { projection: { returned: 1 } });
  if (!booking?.returned) return Response.json({ error: "กรุณาบันทึกรับคืนสินค้าก่อนคืนเงินประกัน" }, { status: 409 });
  const refund = Math.round(body.refund * 100) / 100, deducted = Math.round((deposit.amount - refund) * 100) / 100, reason = body.reason.trim();
  if (deducted < 0) return Response.json({ error: "ยอดคืนต้องไม่เกินเงินประกันที่รับไว้" }, { status: 400 });
  if (deducted > 0 && !reason) return Response.json({ error: "คืนเงินไม่เต็มจำนวน กรุณาระบุเหตุผลที่หักเงิน" }, { status: 400 });
  if (refund > 0 && !body.evidence.length) return Response.json({ error: "กรุณาแนบหลักฐานการโอนคืนอย่างน้อย 1 รูป" }, { status: 400 });
  const by = admin.email || admin.username, now = new Date();
  const status: DepositRecord["status"] = deducted === 0 ? "refunded" : refund === 0 ? "forfeited" : "partial";
  const result = await deposits(db).updateOne({ _id: deposit._id, status: "held" }, { $set: { status, updatedAt: now, refund: { amount: refund, deducted, reason, date: ledgerDate(body.date), evidence: body.evidence, at: now, by, byName: admin.name } } });
  if (!result.modifiedCount) return Response.json({ error: "มีผู้บันทึกการคืนเงินประกันรายการนี้ไปแล้ว" }, { status: 409 });
  // The withheld part becomes shop income (fines); the refunded part never touches the income ledger.
  if (deducted > 0) await transactions(db).insertOne({ _id: randomUUID(), type: "income", category: "ค่าปรับ", amount: deducted, date: ledgerDate(body.date), note: `หักเงินประกัน ${deposit.bookingId}: ${reason}`.slice(0, 300), createdAt: now, createdBy: by, createdByName: admin.name, bookingId: deposit.bookingId, source: "deposit" });
  await audit(request, admin, { action: "deposit.refund", targetType: "booking", targetId: deposit.bookingId, summary: deducted ? `คืนเงินประกัน ${money(refund)} บาท หัก ${money(deducted)} บาท (${reason})` : `คืนเงินประกันเต็มจำนวน ${money(refund)} บาท`, changes: [{ field: "depositStatus", before: "held", after: status }, { field: "refundAmount", before: null, after: refund }, { field: "deducted", before: null, after: deducted }] });
  return Response.json({ deposit: { ...deposit, status, refund: { amount: refund, deducted, reason, date: body.date, evidence: body.evidence, at: now.toISOString(), by, byName: admin.name } } });
}
