import { randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { audit } from "@/lib/audit";
import { ledgerDate, transactions, validDay, type FinanceTransaction } from "@/lib/finance";
import { imageType, uploadProductImage } from "@/lib/r2";

// Deposits are not listed: they are recorded on payment and refunded from the booking, outside this ledger.
const categories = { income: ["ค่าเช่า", "ค่าจัดส่ง", "ค่าปรับ", "อื่น ๆ"], expense: ["ซื้อสินค้า", "ค่าซ่อมแซม", "ค่าแพ็กของ", "ค่าโฆษณา", "ค่าเดินทาง", "ค่าสาธารณูปโภค", "อื่น ๆ"] };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("finance");
  if (auth.error) return auth.error;
  const admin = auth.admin, by = admin.email || admin.username;
  const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;
  const body = isMultipart ? await request.formData().catch(() => null) : await request.json().catch(() => null);
  const db = await database();
  const value = (key: string) => body instanceof FormData ? body.get(key) : body?.[key];
  if (value("action") === "void") {
    const id = value("id"), reason = value("reason");
    if (typeof id !== "string" || id.length > 100 || typeof reason !== "string" || !reason.trim() || reason.length > 300) return Response.json({ error: "กรุณาระบุเหตุผลที่ยกเลิกรายการ" }, { status: 400 });
    const row = await transactions(db).findOne({ _id: id });
    if (!row) return Response.json({ error: "ไม่พบรายการ" }, { status: 404 });
    if (row.voided) return Response.json({ error: "รายการนี้ถูกยกเลิกแล้ว" }, { status: 409 });
    if (row.source && row.source !== "manual") return Response.json({ error: "รายการนี้สร้างจากคำขอจอง กรุณายกเลิกจากหน้าคำขอจอง" }, { status: 409 });
    const voided = { at: new Date(), by, byName: admin.name, reason: reason.trim() };
    await transactions(db).updateOne({ _id: row._id }, { $set: { voided } });
    await audit(request, admin, { action: "finance.void", targetType: "finance", targetId: row._id, summary: `ยกเลิกรายการ${row.type === "income" ? "รายรับ" : "รายจ่าย"} ${row.category} ${row.amount} บาท: ${voided.reason}`, changes: [{ field: "voided", before: null, after: voided.reason }] });
    return Response.json({ voided: { ...voided, at: voided.at.toISOString() } });
  }
  const type = value("type"), category = value("category"), date = value("date"), rawAmount = value("amount"), note = value("note"), rawBookingId = value("bookingId");
  const amount = typeof rawAmount === "string" ? Number(rawAmount) : rawAmount;
  if (!body || !["income", "expense"].includes(type as string) || typeof category !== "string" || !categories[type as "income" | "expense"].includes(category) || !validDay(date) || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000 || (note !== null && note !== undefined && (typeof note !== "string" || note.length > 300)) || (rawBookingId !== null && rawBookingId !== undefined && (typeof rawBookingId !== "string" || rawBookingId.length > 100))) {
    return Response.json({ error: "กรุณาตรวจสอบประเภท หมวดหมู่ วันที่ และจำนวนเงิน" }, { status: 400 });
  }
  const files = body instanceof FormData ? body.getAll("image").filter(item => item instanceof File) as File[] : [];
  if (files.length > 3 || files.some(file => !file.size || file.size > 5 * 1024 * 1024)) return Response.json({ error: "แนบรูปได้ไม่เกิน 3 รูป และรูปละไม่เกิน 5 MB" }, { status: 400 });
  const attachments: string[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer()), contentType = imageType(bytes);
    if (contentType !== "image/webp") return Response.json({ error: "รูปหลักฐานต้องเป็น WebP หลังจากแปลงรูปแล้ว" }, { status: 400 });
    attachments.push(await uploadProductImage(bytes, contentType, "evidence"));
  }
  const bookingId = typeof rawBookingId === "string" ? rawBookingId.trim().toUpperCase() : "";
  if (bookingId && !await db.collection<{ _id: string }>("bookingRequests").findOne({ _id: bookingId }, { projection: { _id: 1 } })) return Response.json({ error: "ไม่พบเลขที่คำขอที่ระบุ" }, { status: 404 });
  const transaction: FinanceTransaction = {
    _id: randomUUID(), type: type as "income" | "expense", category,
    amount: Math.round(amount * 100) / 100,
    date: ledgerDate(date), note: typeof note === "string" ? note.trim() : "",
    createdAt: new Date(), createdBy: by, createdByName: admin.name, source: "manual", ...(bookingId ? { bookingId } : {}), ...(attachments.length ? { attachments } : {}),
  };
  await transactions(db).insertOne(transaction);
  await audit(request, admin, { action: "finance.create", targetType: "finance", targetId: transaction._id, summary: `บันทึก${transaction.type === "income" ? "รายรับ" : "รายจ่าย"} ${transaction.category} ${transaction.amount} บาท${bookingId ? ` (${bookingId})` : ""}`, changes: [{ field: "amount", before: null, after: transaction.amount }, { field: "category", before: null, after: transaction.category }, { field: "date", before: null, after: date }] });
  return Response.json({ transaction: { ...transaction, date: transaction.date.toISOString() } }, { status: 201 });
}
