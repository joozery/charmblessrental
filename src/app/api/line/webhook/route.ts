import { after } from "next/server";
import { database } from "@/lib/mongodb";
import { lineProfileName, replyLine, validLineSignature } from "@/lib/line";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } };
type BookingDoc = { _id: string; phone: string; lineUserId?: string; lineName?: string; lineLinkedAt?: Date };

const digits = (value: string) => value.replace(/[^\d+]/g, "").replace(/^\+66/, "0");
const greeting = "ขอบคุณที่แอดมานะคะ 🙏\nกรุณาพิมพ์ เลขที่คำขอ (เช่น BR-20261020-ABC123) และ เบอร์โทรที่ใช้จอง ส่งมาที่นี่ ร้านจะตรวจสอบและส่งใบรายละเอียดการเช่าพร้อมลิงก์ชำระเงินให้ค่ะ";

async function handle(events: LineEvent[]) {
  const bookings = (await database()).collection<BookingDoc>("bookingRequests");
  for (const event of events) {
    try {
      if (!event.replyToken) continue;
      if (event.type === "follow") { await replyLine(event.replyToken, [{ type: "text", text: greeting }]); continue; }
      const userId = event.source?.userId, text = event.message?.type === "text" ? event.message.text || "" : "";
      if (event.type !== "message" || !userId || !text) continue;
      const id = text.match(/BR-\d{8}-[A-Za-z0-9]{6}/)?.[0].toUpperCase();
      const phone = text.replace(/[\s-]/g, "").match(/(?:\+66|0)\d{8,9}\b/)?.[0];
      const booking = id ? await bookings.findOne({ _id: id }) : null;
      const byPhone = !booking && phone ? await bookings.find({ phone: { $in: [phone, digits(phone)] } }).sort({ createdAt: -1 }).limit(1).next() : null;
      const target = booking || byPhone;
      if (!target) { await replyLine(event.replyToken, [{ type: "text", text: id || phone ? "ยังไม่พบคำขอที่ตรงกับข้อมูลนี้ค่ะ กรุณาตรวจสอบเลขที่คำขอหรือเบอร์โทร แล้วส่งมาอีกครั้งนะคะ" : greeting }]); continue; }
      await bookings.updateOne({ _id: target._id }, { $set: { lineUserId: userId, lineName: await lineProfileName(userId), lineLinkedAt: new Date() } });
      await replyLine(event.replyToken, [{ type: "text", text: `ได้รับข้อมูลคำขอ ${target._id} แล้วค่ะ ร้านกำลังตรวจสอบคิวและจัดทำใบรายละเอียดการเช่า จะส่งลิงก์ชำระเงินให้ที่นี่เร็วๆ นี้นะคะ 💗` }]);
    } catch (error) { console.error("LINE webhook event failed:", error); }
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validLineSignature(raw, request.headers.get("x-line-signature"))) return new Response("invalid signature", { status: 401 });
  let events: LineEvent[] = [];
  try { events = JSON.parse(raw).events || []; } catch { return new Response("bad request", { status: 400 }); }
  if (!events.length) return Response.json({ ok: true });
  after(() => handle(events));
  return Response.json({ ok: true });
}
