import { after } from "next/server";
import { database } from "@/lib/mongodb";
import { randomBytes } from "node:crypto";
import { lineProfileName, replyLine, validLineSignature } from "@/lib/line";
import type { BookingVerification } from "@/lib/identity";
import { reusableProfile } from "@/lib/identity-store";
import { getStoreSettings } from "@/lib/store-settings";
import type { Collection } from "mongodb";
import { audit } from "@/lib/audit";
import { carrierFor, saysReturned, trackingIn } from "@/lib/line-return";
import { rentalStage, stageLabel } from "@/lib/rental-stage";
import { returnMethods, type ScheduleRecord } from "@/lib/schedule";
import { ensureCustomer, type CustomerRecord } from "@/lib/customer-credits";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } };
type BookingDoc = {
  _id: string; name?: string; phone: string; status: string; payment?: string; method?: string; lineUserId?: string; lineName?: string; lineLinkedAt?: Date; billToken?: string;
  verification?: BookingVerification; schedule?: ScheduleRecord; shipment?: { shippedAt?: Date }; returned?: object; customerReturn?: { carrier: string; trackingNumber: string; at: Date; via?: "line" | "bill" };
};

const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^66/, "0");
const greeting = "ขอบคุณที่แอดมานะคะ 🙏\nกรุณาพิมพ์ เลขที่คำขอ (เช่น BR-20261020-ABC123) และ เบอร์โทรที่ใช้จอง ส่งมาที่นี่ ร้านจะตรวจสอบและส่งใบรายละเอียดการเช่าพร้อมลิงก์ชำระเงินให้ค่ะ";
const returnHint = "\n\nเมื่อส่งชุดคืนแล้ว พิมพ์ \"ส่งคืนแล้ว\" พร้อมเลขพัสดุมาที่นี่ได้เลยค่ะ";

async function billLink(bookings: Collection<BookingDoc>, booking: BookingDoc, origin: string) {
  const billToken = booking.billToken || randomBytes(18).toString("base64url");
  if (!booking.billToken) await bookings.updateOne({ _id: booking._id }, { $set: { billToken } });
  return `${origin}/bill/${billToken}`;
}

// What the customer hears after linking a request, depending on how far the rental has got.
function stageReply(booking: BookingDoc) {
  const stage = rentalStage(booking);
  if (stage === "pending") return `ได้รับข้อมูลคำขอ ${booking._id} แล้วค่ะ ร้านกำลังตรวจสอบคิวและจัดทำใบรายละเอียดการเช่า จะส่งลิงก์ชำระเงินให้ที่นี่เร็วๆ นี้นะคะ 💗`;
  if (stage === "cancelled") return `คำขอ ${booking._id} ถูกยกเลิกแล้วค่ะ หากต้องการจองใหม่ ทักร้านได้เลยนะคะ`;
  const status = `คำขอ ${booking._id} สถานะตอนนี้: ${stageLabel(stage, booking.method)} ค่ะ`;
  return stage === "shipped" ? status + returnHint : stage === "returned" ? `${status} ขอบคุณที่ใช้บริการนะคะ 💗` : status;
}

// A customer whose piece is out says it has been sent back: record it like the bill page's return form does.
async function recordReturn(request: Request, bookings: Collection<BookingDoc>, booking: BookingDoc, text: string, origin: string) {
  const tracking = trackingIn(text);
  const method = booking.schedule?.returnMethod;
  const previous = booking.customerReturn;
  if (previous && (!tracking || tracking === previous.trackingNumber)) return `รับทราบค่ะ ร้านบันทึกการส่งคืนไว้แล้ว${previous.trackingNumber ? ` (เลขพัสดุ ${previous.trackingNumber})` : ""} จะแจ้งอีกครั้งเมื่อได้รับสินค้านะคะ 🙏`;
  const carrier = tracking ? carrierFor(tracking) : method && method !== "parcel" ? returnMethods.find(item => item.key === method)!.label : "แจ้งทาง LINE";
  const customerReturn = { carrier, trackingNumber: tracking, at: new Date(), via: "line" as const };
  await bookings.updateOne({ _id: booking._id }, { $set: { customerReturn, updatedAt: new Date() } });
  await audit(request, null, { action: "booking.customer_return", targetType: "booking", targetId: booking._id, summary: `ลูกค้าแจ้งส่งคืนทาง LINE · ${carrier} ${tracking}`.trim(), actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`, changes: [{ field: "carrier", before: previous?.carrier ?? null, after: carrier }, { field: "trackingNumber", before: previous?.trackingNumber ?? null, after: tracking }] });
  if (tracking) return `ได้รับแจ้งส่งคืนแล้วค่ะ 🙏\nคำขอ ${booking._id}\nเลขพัสดุ ${tracking}\nร้านจะแจ้งอีกครั้งเมื่อได้รับสินค้านะคะ`;
  if (method && method !== "parcel") return `ได้รับแจ้งส่งคืนแล้วค่ะ 🙏 (คำขอ ${booking._id}) ร้านจะแจ้งอีกครั้งเมื่อได้รับสินค้านะคะ`;
  return `ได้รับแจ้งส่งคืนแล้วค่ะ 🙏 (คำขอ ${booking._id})\nรบกวนพิมพ์เลขพัสดุส่งมาที่นี่ หรือกรอกในหน้าบิล เพื่อให้ร้านติดตามพัสดุได้นะคะ 👉 ${await billLink(bookings, booking, origin)}`;
}

async function handle(request: Request, events: LineEvent[], origin: string) {
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  for (const event of events) {
    try {
      if (!event.replyToken) continue;
      if (event.type === "follow") { await replyLine(event.replyToken, [{ type: "text", text: greeting }]); continue; }
      const userId = event.source?.userId, text = event.message?.type === "text" ? event.message.text || "" : "";
      if (event.type !== "message" || !userId || !text) continue;
      // A piece this LINE account has out right now: a return message or a parcel code is about that rental.
      const out = await bookings.findOne({ lineUserId: userId, status: { $ne: "cancelled" }, shipment: { $exists: true }, returned: { $exists: false } }, { sort: { "shipment.shippedAt": -1 } });
      if (out && (saysReturned(text) || trackingIn(text))) { await replyLine(event.replyToken, [{ type: "text", text: await recordReturn(request, bookings, out, text, origin) }]); continue; }
      const id = text.match(/BR-\d{8}-[A-Za-z0-9]{6}/)?.[0].toUpperCase();
      const phone = text.match(/(?:\+?66|0)[\d\s-]{8,13}\d/)?.[0];
      const wanted = phone ? normalizePhone(phone) : "";
      const booking = id ? await bookings.findOne({ _id: id }) : null;
      const byPhone = !booking && wanted.length === 10 ? (await bookings.find({}, { projection: { _id: 1, phone: 1 } }).sort({ createdAt: -1 }).limit(500).toArray()).find(row => normalizePhone(row.phone) === wanted) : null;
      const target = booking || byPhone;
      if (!target) {
        // Someone already linked is just chatting with the shop: leave the reply to the admins.
        if (await bookings.findOne({ lineUserId: userId }, { projection: { _id: 1 } })) continue;
        await replyLine(event.replyToken, [{ type: "text", text: id || wanted.length === 10 ? "ยังไม่พบคำขอที่ตรงกับข้อมูลนี้ค่ะ กรุณาตรวจสอบเลขที่คำขอหรือเบอร์โทร แล้วส่งมาอีกครั้งนะคะ" : greeting }]);
        continue;
      }
      const before = await bookings.findOne({ _id: target._id }, { projection: { lineUserId: 1, lineName: 1, name: 1 } });
      const lineName = await lineProfileName(userId);
      await bookings.updateOne({ _id: target._id }, { $set: { lineUserId: userId, lineName, lineLinkedAt: new Date() } });
      await ensureCustomer(db, { lineUserId: userId, lineName, name: target.name, phone: target.phone });
      if (before?.lineUserId !== userId) await db.collection<CustomerRecord>("customers").updateOne({ _id: userId }, { $inc: { bookingCount: 1 }, $set: { updatedAt: new Date() } });
      // Only a new or different LINE account goes in the history; repeating the request number is not news.
      if (before?.lineUserId !== userId) await audit(request, null, { action: "booking.line_linked", targetType: "booking", targetId: target._id, actorEmail: `ลูกค้า${before?.name ? ` ${before.name}` : ""}`,
        summary: `${before?.lineUserId ? "เปลี่ยน LINE ที่ผูกกับคำขอ" : "ผูก LINE กับคำขอ"}${lineName ? ` · ${lineName}` : ""} (พิมพ์${id ? "เลขคำขอ" : "เบอร์โทร"})`, changes: [{ field: "lineName", before: before?.lineUserId ? before.lineName || "(ไม่ทราบชื่อ)" : null, after: lineName || "(ไม่ทราบชื่อ)" }] });
      const full = await bookings.findOne({ _id: target._id });
      if (!full) continue;
      let extra = "";
      // Renting without a deposit: reuse a recent approval from this same LINE account, otherwise send the upload link.
      if (full.status !== "cancelled" && !full.returned && full.verification?.mode === "identity" && (full.verification.status === "pending" || full.verification.status === "rejected")) {
        const settings = await getStoreSettings();
        const reused = await reusableProfile(db, full.verification.profileId, userId, settings.verification);
        if (reused) {
          await bookings.updateOne({ _id: full._id }, { $set: { verification: { ...full.verification, status: "approved", reused: true, reviewedAt: new Date(), reviewedByName: "ใช้การยืนยันตัวตนเดิม" } } });
          await audit(request, null, { action: "identity.reused", targetType: "booking", targetId: full._id, actorEmail: "ระบบ", summary: `ใช้การยืนยันตัวตนเดิม (ผ่านเมื่อ ${reused.approvedAt!.toISOString().slice(0, 10)}${reused.approvedByName ? ` โดย ${reused.approvedByName}` : ""})` });
          extra = "\n\n✅ ใช้ข้อมูลยืนยันตัวตนเดิมของคุณแล้ว ไม่ต้องส่งเอกสารใหม่ค่ะ";
        } else {
          extra = `\n\nคำขอนี้เลือกแบบไม่วางเงินมัดจำ รบกวนยืนยันตัวตน (รูปบัตรประชาชน + แคปหน้า Instagram เต็มหน้าจอ + ที่อยู่) ก่อนวันจัดส่ง ใช้เวลาประมาณ 2 นาที 👉 ${await billLink(bookings, full, origin)}`;
        }
      }
      await replyLine(event.replyToken, [{ type: "text", text: stageReply(full) + extra }]);
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
  after(() => handle(request, events, origin));
  return Response.json({ ok: true });
}
