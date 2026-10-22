// Reading a customer's free-text LINE message about sending the rental back.
const returnWords = /ส่งคืน|ส่งกลับ|คืนชุด|คืนของ|คืนสินค้า|คืนกล้อง|คืนแล้ว|ชุดคืน|ของคืน|return/i;
const moneyWords = /เงิน|มัดจำ|โอน|สลิป/;

export const saysReturned = (text: string) => returnWords.test(text) && !moneyWords.test(text);

// A parcel code: 10–22 letters/digits with at least 8 digits. A booking number or a phone number is not one.
export function trackingIn(text: string) {
  for (const token of text.toUpperCase().replace(/BR-\d{8}-[A-Z0-9]{6}/g, " ").match(/[A-Z0-9]{10,22}/g) || []) {
    if ((token.match(/\d/g) || []).length < 8) continue;
    if (/^(?:0\d{9}|66\d{9})$/.test(token)) continue;
    return token;
  }
  return "";
}

export function carrierFor(tracking: string) {
  if (/^[A-Z]{2}\d{9}TH$/.test(tracking)) return "ไปรษณีย์ไทย";
  if (/^TH\d/.test(tracking)) return "Flash Express";
  if (/^(KER|KEX|KBK|SHP)/.test(tracking)) return "Kerry Express";
  if (/^(JT|JNT)/.test(tracking) || /^\d{12}$/.test(tracking)) return "J&T Express";
  return "แจ้งทาง LINE";
}
