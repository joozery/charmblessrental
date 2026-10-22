import { after } from "next/server";
import { database } from "@/lib/mongodb";
import { randomBytes } from "node:crypto";
import { lineProfileName, replyLine, validLineSignature } from "@/lib/line";
import type { BookingVerification } from "@/lib/identity";
import { reusableProfile } from "@/lib/identity-store";
import { getStoreSettings } from "@/lib/store-settings";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } };
type BookingDoc = { _id: string; phone: string; lineUserId?: string; lineName?: string; lineLinkedAt?: Date; billToken?: string; verification?: BookingVerification };

const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^66/, "0");
const greeting = "ขอบคุณที่แอดมานะคะ 🙏\nกรุณาพิมพ์ เลขที่คำขอ (เช่น BR-20261020-ABC123) และ เบอร์โทรที่ใช้จอง ส่งมาที่นี่ ร้านจะตรวจสอบและส่งใบรายละเอียดการเช่าพร้อมลิงก์ชำระเงินให้ค่ะ";

async function handle(events: LineEvent[], origin: string) {
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  for (const event of events) {
    try {
      if (!event.replyToken) continue;
      if (event.type === "follow") { await replyLine(event.replyToken, [{ type: "text", text: greeting }]); continue; }
      const userId = event.source?.userId, text = event.message?.type === "text" ? event.message.text || "" : "";
      if (event.type !== "message" || !userId || !text) continue;
      const id = text.match(/BR-\d{8}-[A-Za-z0-9]{6}/)?.[0].toUpperCase();
      const phone = text.match(/(?:\+?66|0)[\d\s-]{8,13}\d/)?.[0];
      const wanted = phone ? normalizePhone(phone) : "";
      const booking = id ? await bookings.findOne({ _id: id }) : null;
      const byPhone = !booking && wanted.length === 10 ? (await bookings.find({}, { projection: { _id: 1, phone: 1 } }).sort({ createdAt: -1 }).limit(500).toArray()).find(row => normalizePhone(row.phone) === wanted) : null;
      const target = booking || byPhone;
      if (!target) { await replyLine(event.replyToken, [{ type: "text", text: id || phone ? "ยังไม่พบคำขอที่ตรงกับข้อมูลนี้ค่ะ กรุณาตรวจสอบเลขที่คำขอหรือเบอร์โทร แล้วส่งมาอีกครั้งนะคะ" : greeting }]); continue; }
      await bookings.updateOne({ _id: target._id }, { $set: { lineUserId: userId, lineName: await lineProfileName(userId), lineLinkedAt: new Date() } });
      const full = await bookings.findOne({ _id: target._id });
      let extra = "";
      // Renting without a deposit: reuse a recent approval from this same LINE account, otherwise send the upload link.
      if (full?.verification?.mode === "identity" && (full.verification.status === "pending" || full.verification.status === "rejected")) {
        const settings = await getStoreSettings();
        const reused = await reusableProfile(db, full.verification.profileId, userId, settings.verification);
        if (reused) {
          await bookings.updateOne({ _id: full._id }, { $set: { verification: { ...full.verification, status: "approved", reused: true, reviewedAt: new Date(), reviewedByName: "ใช้การยืนยันตัวตนเดิม" } } });
          extra = "\n\n✅ ใช้ข้อมูลยืนยันตัวตนเดิมของคุณแล้ว ไม่ต้องส่งเอกสารใหม่ค่ะ";
        } else {
          const billToken = full.billToken || randomBytes(18).toString("base64url");
          if (!full.billToken) await bookings.updateOne({ _id: full._id }, { $set: { billToken } });
          extra = `\n\nคำขอนี้เลือกแบบไม่วางเงินประกัน รบกวนยืนยันตัวตน (รูปบัตรประชาชน + เซลฟี่คู่บัตร + ที่อยู่) ก่อนวันจัดส่ง ใช้เวลาประมาณ 2 นาที 👉 ${origin}/bill/${billToken}`;
        }
      }
      await replyLine(event.replyToken, [{ type: "text", text: `ได้รับข้อมูลคำขอ ${target._id} แล้วค่ะ ร้านกำลังตรวจสอบคิวและจัดทำใบรายละเอียดการเช่า จะส่งลิงก์ชำระเงินให้ที่นี่เร็วๆ นี้นะคะ 💗${extra}` }]);
    } catch (error) { console.error("LINE webhook event failed:", error); }
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validLineSignature(raw, request.headers.get("x-line-signature"))) return new Response("invalid signature", { status: 401 });
  let events: LineEvent[] = [];
  try { events = JSON.parse(raw).events || []; } catch { return new Response("bad request", { status: 400 }); }
  if (!events.length) return Response.json({ ok: true });
  const origin = new URL(request.url).origin;
  after(() => handle(events, origin));
  return Response.json({ ok: true });
}
