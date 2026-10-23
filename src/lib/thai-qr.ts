// Client-safe: Thai QR Payment (EMVCo) text, as printed in the shop's แม่มณี / K SHOP / PromptPay QR.
// The text is a list of id-length-value fields ending in a CRC. A fixed amount is field 54, and field 01
// becomes "12" (one-time) so banking apps fill in the amount and do not let the customer change it.
type Field = { id: string; value: string };

function parse(text: string): Field[] | null {
  const fields: Field[] = [];
  for (let i = 0; i < text.length;) {
    const id = text.slice(i, i + 2), size = Number(text.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(text.slice(i + 2, i + 4)) || i + 4 + size > text.length) return null;
    fields.push({ id, value: text.slice(i + 4, i + 4 + size) }); i += 4 + size;
  }
  return fields;
}
const join = (fields: Field[]) => fields.map(field => field.id + String(field.value.length).padStart(2, "0") + field.value).join("");

// CRC-16/CCITT-FALSE over everything up to and including "6304", as Thai QR requires.
export function crc16(text: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// A payment QR the shop can use: well formed, CRC intact, in baht, and paying through PromptPay / Thai QR (fields 29–31).
export function validThaiQr(text: unknown): text is string {
  if (typeof text !== "string" || text.length < 30 || text.length > 512 || !text.startsWith("000201")) return false;
  const fields = parse(text), crc = fields?.at(-1);
  if (!fields || crc?.id !== "63" || crc.value.length !== 4 || crc16(text.slice(0, -4)) !== crc.value.toUpperCase()) return false;
  return fields.some(field => ["29", "30", "31"].includes(field.id)) && (fields.find(field => field.id === "53")?.value ?? "764") === "764";
}

// The shop's QR with this bill's amount fixed in it.
export function thaiQrWithAmount(text: string, amount: number) {
  const fields = parse(text)?.filter(field => field.id !== "54" && field.id !== "63");
  if (!fields || !(amount > 0)) return null;
  const point = fields.find(field => field.id === "01");
  if (point) point.value = "12"; else fields.splice(1, 0, { id: "01", value: "12" });
  const at = fields.findIndex(field => Number(field.id) > 54);
  fields.splice(at < 0 ? fields.length : at, 0, { id: "54", value: amount.toFixed(2) });
  const body = join(fields) + "6304";
  return body + crc16(body);
}

// The ids the QR pays to: PromptPay numbers, biller ids and merchant ids (subfields of fields 29–31).
// A slip paid through a แม่มณี / K SHOP QR names the receiver by one of these instead of a bank account.
export const thaiQrIds = (text: string) => (parse(text) || []).filter(field => ["29", "30", "31"].includes(field.id))
  .flatMap(field => (parse(field.value) || []).filter(sub => sub.id !== "00" && /^[A-Z0-9]{6,}$/i.test(sub.value)).map(sub => sub.value));

// The merchant name printed in the QR (field 59), to show the shop which account a QR pays.
export const thaiQrName = (text: string) => parse(text)?.find(field => field.id === "59")?.value || "";
