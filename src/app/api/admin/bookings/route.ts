import { currentAdmin, sameOrigin } from "@/lib/admin-auth";
import { randomBytes } from "node:crypto";
import { database } from "@/lib/mongodb";
import { lineConfigured, pushLine } from "@/lib/line";
import { getEffectiveAvailability } from "@/lib/availability-store";
const statuses = ["new", "contacted", "confirmed", "cancelled"];
type BookingDoc = { _id: string; status: string; billToken?: string; payment?: "unpaid" | "paid"; lineUserId?: string; lineSentAt?: Date; quote?: unknown; name?: string; paidAt?: Date | null; updatedAt?: Date; updatedBy?: string; start: string; end: string; items: { id: number; name?: string }[] };
type QuoteInput = { rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string };
const validQuote = (quote: unknown): quote is QuoteInput => { if (!quote || typeof quote !== "object") return false; const value = quote as Record<string, unknown>; return ["rental", "deposit", "shipping"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0) && ["bank", "accountName", "accountNumber", "returnAddress", "returnPhone", "returnMethod"].every(key => typeof value[key] === "string" && (value[key] as string).length <= 500) && typeof value.qrImage === "string" && value.qrImage.length <= 2000; };
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || body.id.length > 100 || (!statuses.includes(body.status) && !["saveQuote", "billLink", "setPayment", "sendLine"].includes(body.action)) || (body.action === "saveQuote" && !validQuote(body.quote)) || (body.action === "setPayment" && typeof body.paid !== "boolean")) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ _id: body.id });
  if (!booking) return Response.json({ error: "ไม่พบคำขอจองนี้" }, { status: 404 });
  if (body.action === "billLink") {
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: body.id }, { $set: { billToken, payment: booking.payment || "unpaid" } });
    return Response.json({ ok: true, billToken });
  }
  if (body.action === "sendLine") {
    if (!lineConfigured()) return Response.json({ error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN" }, { status: 503 });
    if (!booking.lineUserId) return Response.json({ error: "ลูกค้ายังไม่ได้ส่งเลขที่คำขอหรือเบอร์โทรใน LINE" }, { status: 409 });
    if (!booking.quote) return Response.json({ error: "กรุณากดบันทึกราคาในใบสรุปก่อนส่งบิล" }, { status: 409 });
    const billToken = booking.billToken || randomBytes(18).toString("base64url");
    if (!booking.billToken) await bookings.updateOne({ _id: body.id }, { $set: { billToken, payment: booking.payment || "unpaid" } });
    const origin = new URL(request.url).origin, billUrl = `${origin}/bill/${billToken}`;
    const imageUrl = `${billUrl}/image?v=${Date.now()}`;
    const text = { type: "text" as const, text: `ใบรายละเอียดการเช่า (${booking._id}) ของคุณ${booking.name ? " " + booking.name : ""} พร้อมแล้วค่ะ\nดูบิลและบันทึกไฟล์: ${billUrl}\n\nกรุณาตรวจสอบยอด โอนเงินตามยอดสุทธิ และส่งสลิปในแชทนี้นะคะ 🙏` };
    try { await pushLine(booking.lineUserId, origin.startsWith("https://") ? [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }, text] : [text]); } catch (error) { console.error("LINE push failed:", error); return Response.json({ error: "ส่งข้อความไม่สำเร็จ ลูกค้าอาจบล็อกบัญชีร้านหรือ token ไม่ถูกต้อง" }, { status: 502 }); }
    await bookings.updateOne({ _id: body.id }, { $set: { lineSentAt: new Date() } });
    return Response.json({ ok: true, billToken });
  }
  if (body.action === "setPayment") {
    await bookings.updateOne({ _id: body.id }, { $set: { payment: body.paid ? "paid" : "unpaid", paidAt: body.paid ? new Date() : null, updatedAt: new Date(), updatedBy: admin.email } });
    return Response.json({ ok: true });
  }
  if (body.action === "saveQuote") {
    await bookings.updateOne({ _id: body.id }, { $set: { quote: { ...body.quote, updatedAt: new Date(), updatedBy: admin.email } } });
    return Response.json({ ok: true });
  }
  if (body.status === "confirmed" && booking.status !== "confirmed") {
    const days = (Date.parse(`${booking.end}T00:00:00Z`) - Date.parse(`${booking.start}T00:00:00Z`)) / 86400000;
    for (const item of booking.items) {
      const available = await getEffectiveAvailability(db, item.id, booking.start, booking.end);
      if (available.length < days || available.some(day => day.remaining < 1)) return Response.json({ error: `คิวของ ${item.name || "สินค้าบางรายการ"} ไม่พอหรือยังไม่ได้ตั้งจำนวนว่างครบทุกวัน` }, { status: 409 });
    }
  }
  await bookings.updateOne({ _id: body.id }, { $set: { status: body.status, updatedAt: new Date(), updatedBy: admin.email } });
  return Response.json({ ok: true });
}
