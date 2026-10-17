import { randomUUID } from "node:crypto";
import { currentAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";

const categories = ["ค่าเช่า", "ค่าจัดส่ง", "เงินประกัน", "ค่าปรับ", "ซื้อสินค้า", "ค่าซ่อมแซม", "ค่าแพ็กของ", "ค่าโฆษณา", "ค่าเดินทาง", "ค่าสาธารณูปโภค", "คืนเงินประกัน", "อื่น ๆ"];
const validDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !["income", "expense"].includes(body.type) || typeof body.category !== "string" || !categories.includes(body.category) || !validDay(body.date) || typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1000000000 || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 300))) {
    return Response.json({ error: "กรุณาตรวจสอบประเภท หมวดหมู่ วันที่ และจำนวนเงิน" }, { status: 400 });
  }
  const transaction = {
    _id: randomUUID(), type: body.type as "income" | "expense", category: body.category,
    amount: Math.round(body.amount * 100) / 100,
    date: new Date(`${body.date}T12:00:00.000Z`), note: typeof body.note === "string" ? body.note.trim() : "",
    createdAt: new Date(), createdBy: admin.email,
  };
  await (await database()).collection<typeof transaction>("financeTransactions").insertOne(transaction);
  return Response.json({ transaction: { ...transaction, date: transaction.date.toISOString() } }, { status: 201 });
}
