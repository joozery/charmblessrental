import { createHmac, timingSafeEqual } from "node:crypto";

const api = "https://api.line.me/v2/bot";
export const lineConfigured = () => !!process.env.LINE_CHANNEL_SECRET && !!process.env.LINE_CHANNEL_ACCESS_TOKEN;

export function validLineSignature(body: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function call(path: string, init: RequestInit) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  const response = await fetch(`${api}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
  return response;
}

type TextMessage = { type: "text"; text: string };
type ImageMessage = { type: "image"; originalContentUrl: string; previewImageUrl: string };
type FlexMessage = {
  type: "flex";
  altText: string;
  contents: {
    type: "bubble";
    size: "mega";
    header: { type: "box"; layout: "vertical"; backgroundColor: string; paddingAll: string; contents: Array<Record<string, unknown>> };
    body: { type: "box"; layout: "vertical"; paddingAll: string; contents: Array<Record<string, unknown>> };
    footer?: { type: "box"; layout: "vertical"; paddingAll: string; contents: Array<Record<string, unknown>> };
  };
};
type LineMessage = TextMessage | ImageMessage | FlexMessage;

const identityCard = (message: TextMessage, bookingId: string, url: string): FlexMessage => ({
  type: "flex",
  altText: message.text.slice(0, 400),
  contents: {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#ffffff",
      paddingAll: "22px",
      contents: [{ type: "text", text: "Charmblessrental.", color: "#96395d", size: "xl", weight: "bold" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "22px",
      contents: [
        { type: "text", text: "ยืนยันตัวตนก่อนเช่า", color: "#171824", size: "xl", weight: "bold", wrap: true },
        { type: "text", text: "สำหรับลูกค้าที่เช่าแบบไม่วางเงินมัดจำ กรุณาเตรียมข้อมูลด้านล่างเพื่อดำเนินการต่อ ใช้เวลาประมาณ 2 นาที", color: "#706975", size: "sm", wrap: true, margin: "lg", lineSpacing: "5px" },
        { type: "box", layout: "vertical", backgroundColor: "#fff8fb", cornerRadius: "18px", paddingAll: "16px", margin: "xl", contents: [
          { type: "text", text: "หมายเลขคำขอ", color: "#706975", size: "sm" },
          { type: "text", text: bookingId, color: "#171824", size: "lg", weight: "bold", margin: "sm" },
        ] },
        { type: "box", layout: "vertical", borderColor: "#f0dce5", borderWidth: "1px", cornerRadius: "18px", paddingAll: "16px", margin: "lg", contents: [
          { type: "text", text: "สิ่งที่ต้องเตรียม", color: "#171824", size: "lg", weight: "bold" },
          { type: "box", layout: "horizontal", margin: "lg", contents: [{ type: "text", text: "👤", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "ชื่อ–นามสกุลผู้เช่า", weight: "bold", size: "sm" }, { type: "text", text: "กรอกชื่อและนามสกุลของผู้เช่า", color: "#706975", size: "xs", wrap: true, margin: "xs" }] }] },
          { type: "box", layout: "horizontal", margin: "lg", contents: [{ type: "text", text: "🪪", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "รูปบัตรประชาชน", weight: "bold", size: "sm" }, { type: "text", text: "ใช้ภาพที่เห็นชื่อและรูปถ่ายชัดเจน สามารถปิดข้อมูลส่วนอื่นที่ไม่จำเป็นได้", color: "#706975", size: "xs", wrap: true, margin: "xs" }] }] },
          { type: "box", layout: "horizontal", margin: "lg", contents: [{ type: "text", text: "📷", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "ภาพหน้าโปรไฟล์ Instagram", weight: "bold", size: "sm" }, { type: "text", text: "แคปหน้าจอโปรไฟล์ให้เห็นชื่อบัญชีและหน้าโปรไฟล์เต็มหน้าจอ", color: "#706975", size: "xs", wrap: true, margin: "xs" }] }] },
          { type: "box", layout: "horizontal", margin: "lg", contents: [{ type: "text", text: "🏠", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "ที่อยู่สำหรับจัดส่ง", weight: "bold", size: "sm" }, { type: "text", text: "เตรียมที่อยู่และเบอร์โทรศัพท์สำหรับการจัดส่งสินค้า", color: "#706975", size: "xs", wrap: true, margin: "xs" }] }] },
        ] },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "22px",
      contents: [
        { type: "button", style: "primary", color: "#96395d", action: { type: "uri", label: "เริ่มยืนยันตัวตน →", uri: url } },
        { type: "text", text: "ข้อมูลจะใช้สำหรับตรวจสอบตัวตนและดำเนินการเช่าตามนโยบายความเป็นส่วนตัวของร้าน", color: "#706975", size: "xs", align: "center", wrap: true, margin: "lg" },
      ],
    },
  },
});

const shippedCard = (message: TextMessage, bookingId: string, url: string): FlexMessage => {
  const tracking = message.text.match(/\b[A-Z]{1,5}\d{8,}\b/)?.[0] || "";
  const trackingLine = message.text.split("\n").find(line => tracking && line.includes(tracking)) || "";
  const carrier = trackingLine.replace(tracking, "").trim() || "Flash Express";
  const due = message.text.split("\n").find(line => line.includes("กำหนดส่งคืน"))?.replace(/^.*?กำหนดส่งคืน\s*/, "") || "ตามกำหนดในบิล";
  return {
    type: "flex",
    altText: message.text.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: "#96395d", paddingAll: "22px", contents: [{ type: "text", text: "Charmblessrental", color: "#ffffff", size: "xl", weight: "bold" }, { type: "text", text: "เช่าง่าย　สวยครบ　พร้อมส่งถึงมือคุณ", color: "#ffe6a7", size: "sm", margin: "sm" }] },
      body: { type: "box", layout: "vertical", paddingAll: "18px", contents: [
        { type: "box", layout: "vertical", backgroundColor: "#fff3f7", cornerRadius: "16px", paddingAll: "16px", contents: [{ type: "text", text: "✓　จัดส่งคำขอแล้วค่ะ", color: "#96395d", size: "xl", weight: "bold", wrap: true }, { type: "text", text: `เลขคำขอ　${bookingId}`, color: "#68748a", size: "sm", margin: "sm" }, { type: "text", text: "เรากำลังดำเนินการจัดส่งสินค้าของคุณ สามารถตรวจสอบสถานะได้ที่ลิงก์ด้านล่างค่ะ", color: "#68748a", size: "xs", wrap: true, margin: "md" }] },
        { type: "box", layout: "horizontal", margin: "lg", paddingAll: "12px", contents: [{ type: "text", text: "🚚", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "ขนส่ง", size: "sm", weight: "bold" }, { type: "text", text: carrier, size: "md", margin: "xs" }] }] },
        ...(tracking ? [{ type: "box", layout: "horizontal", margin: "lg", paddingAll: "12px", contents: [{ type: "text", text: "📄", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "เลขพัสดุ", size: "sm", weight: "bold" }, { type: "text", text: tracking, size: "md", margin: "xs" }] }, { type: "button", style: "secondary", action: { type: "clipboard", label: "คัดลอก", clipboardText: tracking } }] }] : []),
        { type: "box", layout: "horizontal", margin: "lg", paddingAll: "12px", contents: [{ type: "text", text: "📅", size: "xl", flex: 0 }, { type: "box", layout: "vertical", flex: 1, margin: "md", contents: [{ type: "text", text: "กำหนดส่งคืน", size: "sm", weight: "bold" }, { type: "text", text: due, size: "md", margin: "xs" }] }] },
      ] },
      footer: { type: "box", layout: "vertical", paddingAll: "18px", contents: [{ type: "button", style: "primary", color: "#96395d", action: { type: "uri", label: "📄　เปิดรายละเอียด　→", uri: url } }] },
    },
  };
};

const returnCard = (message: TextMessage, bookingId: string): FlexMessage => {
  const tracking = message.text.match(/\b[A-Z]{1,5}\d{8,}\b/)?.[0] || "ยังไม่ได้แจ้งเลขพัสดุ";
  return {
    type: "flex",
    altText: message.text.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: "#96395d", paddingAll: "22px", contents: [{ type: "text", text: "Charmblessrental", color: "#ffffff", size: "xl", weight: "bold" }, { type: "text", text: "ได้รับแจ้งคืนชุดแล้วค่ะ", color: "#ffe6a7", size: "sm", margin: "sm" }] },
      body: { type: "box", layout: "vertical", paddingAll: "22px", contents: [
        { type: "box", layout: "horizontal", alignItems: "center", contents: [{ type: "text", text: "📦↩", size: "xxl", flex: 0 }, { type: "text", text: "ได้รับแจ้งคืนชุดแล้วค่ะ", color: "#192235", size: "xl", weight: "bold", wrap: true, margin: "lg" }] },
        { type: "box", layout: "horizontal", margin: "xl", paddingAll: "16px", backgroundColor: "#fff8fb", cornerRadius: "16px", contents: [{ type: "text", text: "📄", size: "xl", flex: 0 }, { type: "box", layout: "vertical", margin: "md", contents: [{ type: "text", text: "คำขอ", color: "#8791a4", size: "sm" }, { type: "text", text: bookingId, color: "#192235", size: "lg", weight: "bold", margin: "xs" }] }] },
        { type: "box", layout: "horizontal", margin: "lg", paddingAll: "16px", backgroundColor: "#fff8fb", cornerRadius: "16px", contents: [{ type: "text", text: "📦", size: "xl", flex: 0 }, { type: "box", layout: "vertical", margin: "md", contents: [{ type: "text", text: "เลขพัสดุ", color: "#8791a4", size: "sm" }, { type: "text", text: tracking, color: "#192235", size: "lg", weight: "bold", margin: "xs" }] }] },
        { type: "box", layout: "horizontal", margin: "xl", paddingTop: "16px", borderColor: "#e7ebf0", borderWidth: "1px", contents: [{ type: "text", text: "📣", color: "#96395d", size: "xl", flex: 0 }, { type: "text", text: "ร้านจะแจ้งอีกครั้งเมื่อได้รับสินค้าที่เรียบร้อยค่ะ", color: "#263248", size: "sm", wrap: true, margin: "lg" }] },
      ] },
    },
  };
};

const cardForText = (message: TextMessage): FlexMessage => {
  const text = message.text.trim();
  const [firstLine = "แจ้งเตือนจากร้าน"] = text.split("\n").filter(Boolean);
  const title = firstLine.replace(/[🎉✅📦💳📷🔍📝🌷🙏💗]/gu, "").trim().slice(0, 60) || "แจ้งเตือนจากร้าน";
  const url = text.match(/https?:\/\/[^\s)]+/)?.[0];
  const bookingId = text.match(/BR-\d{8}-[A-Za-z0-9]{6}/)?.[0];
  if (bookingId && url && text.includes("Instagram")) return identityCard(message, bookingId, url);
  if (bookingId && text.includes("ส่งคืนแล้ว")) return returnCard(message, bookingId);
  if (bookingId && url && text.includes("กำหนดส่งคืน")) return shippedCard(message, bookingId, url);
  return {
    type: "flex",
    altText: text.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#96395d",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "Charmblessrental", color: "#ffffff", size: "lg", weight: "bold" },
          { type: "text", text: title, color: "#ffe9b0", size: "sm", margin: "sm", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [{ type: "text", text, color: "#333333", size: "md", wrap: true }],
      },
      ...(url ? {
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          contents: [{ type: "button", style: "primary", color: "#96395d", action: { type: "uri", label: "เปิดรายละเอียด", uri: url } }],
        },
      } : {}),
    },
  };
};

const cardsFor = (messages: LineMessage[]) => messages.map(message => message.type === "text" ? cardForText(message) : message);
export const replyLine = (replyToken: string, messages: LineMessage[]) => call("/message/reply", { method: "POST", body: JSON.stringify({ replyToken, messages: cardsFor(messages) }) });
export const pushLine = (to: string, messages: LineMessage[]) => call("/message/push", { method: "POST", body: JSON.stringify({ to, messages: cardsFor(messages) }) });
export async function lineProfileName(userId: string) {
  try { return String((await (await call(`/profile/${encodeURIComponent(userId)}`, { method: "GET" })).json()).displayName || ""); } catch { return ""; }
}
