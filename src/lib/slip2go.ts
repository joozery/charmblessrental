// Server-only: reads a transfer slip's QR code through Slip2Go, which asks the bank for the real transaction.
// SLIP2GO_SECRET_KEY is the secret key from Slip2Go → API Connect → Authentication; SLIP2GO_API_URL only overrides the API address.
// Every call costs a token, so callers cap how often one bill may try.
export type SlipCheck =
  | { ok: true; transRef: string; amount: number; dateTime: string; senderName: string; receiverName: string; receiverAccounts: string[]; raw: string }
  | { ok: false; reason: string; raw?: string };

export const slip2goConfigured = () => !!process.env.SLIP2GO_SECRET_KEY;

// Codes for "this slip is a real transaction"; anything else (not found, fraud, duplicate) is a failed check.
const foundCodes = new Set(["200000", "200200"]);
const failures: Record<string, string> = { "200404": "ไม่พบรายการนี้ในระบบธนาคาร", "200500": "สลิปเสียหรือสลิปปลอม", "200501": "สลิปนี้เคยถูกตรวจแล้ว (สลิปซ้ำ)", "200502": "ระบบธนาคารขัดข้อง กรุณาลองใหม่อีกครั้ง" };
const str = (value: unknown) => typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
// Every account-like string under the receiver (masked as "xxx-x-x1234-x" by the bank), wherever Slip2Go puts it.
const accountStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string" && /[0-9A-Za-z*]{6,}/.test(value.replace(/[\s-]/g, "")) && /\d{2}/.test(value)) out.push(value);
  else if (value && typeof value === "object") for (const item of Object.values(value)) accountStrings(item, out);
  return out;
};

export async function checkSlip(image: Uint8Array, contentType: string): Promise<SlipCheck> {
  const url = process.env.SLIP2GO_API_URL || "https://connect.slip2go.com", key = process.env.SLIP2GO_SECRET_KEY;
  if (!key) return { ok: false, reason: "ยังไม่ได้ตั้งค่า Slip2Go" };
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(image)], { type: contentType }), contentType === "image/png" ? "slip.png" : "slip.jpg");
  // Slip2Go also remembers slips checked through the shop's LINE chat, so a slip already used there is caught too.
  form.append("payload", JSON.stringify({ checkDuplicate: true }));
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}/api/verify-slip/qr-image/info`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(15000), cache: "no-store" });
  } catch (error) {
    console.error("Slip2Go request failed:", error);
    return { ok: false, reason: "ระบบตรวจสลิปไม่ตอบสนอง" };
  }
  const text = await response.text(), raw = text.slice(0, 4000);
  let body: { code?: unknown; message?: unknown; data?: Record<string, unknown> };
  try { body = JSON.parse(text); } catch { return { ok: false, reason: `ระบบตรวจสลิปตอบกลับผิดรูปแบบ (HTTP ${response.status})`, raw }; }
  const code = str(body.code);
  if (!response.ok || !foundCodes.has(code) || !body.data) return { ok: false, reason: `ตรวจสลิปไม่ผ่าน: ${failures[code] || str(body.message) || `รหัส ${code || response.status}`}`, raw };
  const data = body.data as { transRef?: unknown; amount?: unknown; dateTime?: unknown; sender?: { account?: { name?: unknown } }; receiver?: { account?: { name?: unknown } } };
  const amount = Number(str(data.amount).replace(/,/g, ""));
  if (!str(data.transRef) || !Number.isFinite(amount)) return { ok: false, reason: "อ่านเลขอ้างอิงหรือยอดเงินจากสลิปไม่ได้", raw };
  return { ok: true, transRef: str(data.transRef), amount, dateTime: str(data.dateTime), senderName: str(data.sender?.account?.name), receiverName: str(data.receiver?.account?.name), receiverAccounts: accountStrings(data.receiver), raw };
}

// Slips show the receiver masked ("xxx-x-x1234-x"); the visible characters must sit where the shop's account or
// merchant id has them. A receiver shown in full must equal it.
export function accountMatches(masked: string, account: string) {
  const a = masked.toUpperCase().replace(/[^0-9A-Z*]/g, ""), b = account.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!b || a.length !== b.length) return false;
  if (!/[X*]/.test(a.replace(/[^X*]/g, "")) || b.includes("X")) return a === b;
  let shown = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] !== "X" && a[i] !== "*") { if (a[i] !== b[i]) return false; shown++; } }
  return shown >= 3;
}
const titles = /^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|บจก\.|บริษัท|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
const plain = (name: string) => name.normalize("NFC").toLowerCase().replace(titles, "").replace(/[\s.]/g, "");
// Slips usually show the first name and a cut-off surname, so the slip's first name must start the shop's account name.
export function nameMatches(slipName: string, accountName: string) {
  const first = slipName.normalize("NFC").toLowerCase().replace(titles, "").trim().split(/\s+/)[0]?.replace(/\./g, "") || "";
  return first.length >= 2 && plain(accountName).startsWith(first);
}
