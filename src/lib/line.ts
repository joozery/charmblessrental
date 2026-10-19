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
export const replyLine = (replyToken: string, messages: TextMessage[]) => call("/message/reply", { method: "POST", body: JSON.stringify({ replyToken, messages }) });
export const pushLine = (to: string, messages: TextMessage[]) => call("/message/push", { method: "POST", body: JSON.stringify({ to, messages }) });
export async function lineProfileName(userId: string) {
  try { return String((await (await call(`/profile/${encodeURIComponent(userId)}`, { method: "GET" })).json()).displayName || ""); } catch { return ""; }
}
