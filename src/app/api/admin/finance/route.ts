import { randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { audit } from "@/lib/audit";
import { ledgerDate, transactions, validDay, type FinanceTransaction } from "@/lib/finance";

// Deposits are not listed: they are recorded on payment and refunded from the booking, outside this ledger.
const categories = { income: ["ค่าเช่า", "ค่าจัดส่ง", "ค่าปรับ", "อื่น ๆ"], expense: ["ซื้อสินค้า", "ค่าซ่อมแซม", "ค่าแพ็กของ", "ค่าโฆษณา", "ค่าเดินทาง", "ค่าสาธารณูปโภค", "อื่น ๆ"] };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("finance");
  if (auth.error) return auth.error;
  const admin = auth.admin, by = admin.email || admin.username;
  const body = await request.json().catch(() => null);
  const db = await database();
  if (body?.action === "void") {
    if (typeof body.id !== "string" || body.id.length > 100 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 300) return Response.json({ error: "กรุณาระบุเหตุผลที่ยกเลิกรายการ" }, { status: 400 });
    const row = await transactions(db).findOne({ _id: body.id });
    if (!row) return Response.json({ error: "ไม่พบรายการ" }, { status: 404 });
    if (row.voided) return Response.json({ error: "รายการนี้ถูกยกเลิกแล้ว" }, { status: 409 });
    if (row.source && row.source !== "manual") return Response.json({ error: "รายการนี้สร้างจากคำขอจอง กรุณายกเลิกจากหน้าคำขอจอง" }, { status: 409 });
    const voided = { at: new Date(), by, byName: admin.name, reason: body.reason.trim() };
    await transactions(db).updateOne({ _id: row._id }, { $set: { voided } });
    await audit(request, admin, { action: "finance.void", targetType: "finance", targetId: row._id, summary: `ยกเลิกรายการ${row.type === "income" ? "รายรับ" : "รายจ่าย"} ${row.category} ${row.amount} บาท: ${voided.reason}`, changes: [{ field: "voided", before: null, after: voided.reason }] });
    return Response.json({ voided: { ...voided, at: voided.at.toISOString() } });
  }
  if (!body || !["income", "expense"].includes(body.type) || typeof body.category !== "string" || !categories[body.type as "income" | "expense"].includes(body.category) || !validDay(body.date) || typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1000000000 || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 300)) || (body.bookingId !== undefined && (typeof body.bookingId !== "string" || body.bookingId.length > 100))) {
    return Response.json({ error: "กรุณาตรวจสอบประเภท หมวดหมู่ วันที่ และจำนวนเงิน" }, { status: 400 });
  }
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim().toUpperCase() : "";
  if (bookingId && !await db.collection<{ _id: string }>("bookingRequests").findOne({ _id: bookingId }, { projection: { _id: 1 } })) return Response.json({ error: "ไม่พบเลขที่คำขอที่ระบุ" }, { status: 404 });
  const transaction: FinanceTransaction = {
    _id: randomUUID(), type: body.type, category: body.category,
    amount: Math.round(body.amount * 100) / 100,
    date: ledgerDate(body.date), note: typeof body.note === "string" ? body.note.trim() : "",
    createdAt: new Date(), createdBy: by, createdByName: admin.name, source: "manual", ...(bookingId ? { bookingId } : {}),
  };
  await transactions(db).insertOne(transaction);
  await audit(request, admin, { action: "finance.create", targetType: "finance", targetId: transaction._id, summary: `บันทึก${transaction.type === "income" ? "รายรับ" : "รายจ่าย"} ${transaction.category} ${transaction.amount} บาท${bookingId ? ` (${bookingId})` : ""}`, changes: [{ field: "amount", before: null, after: transaction.amount }, { field: "category", before: null, after: transaction.category }, { field: "date", before: null, after: body.date }] });
  return Response.json({ transaction: { ...transaction, date: transaction.date.toISOString() } }, { status: 201 });
}
