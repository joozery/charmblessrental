// Client-safe: the account a refundable deposit goes back to, given at booking or later from the bill link.
export type RefundAccount = { bank: string; accountName: string; accountNumber: string };
export const refundBanks = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต (ttb)", "ออมสิน", "ธ.ก.ส.", "ยูโอบี", "ซีไอเอ็มบี ไทย", "เกียรตินาคินภัทร", "แลนด์ แอนด์ เฮ้าส์", "อาคารสงเคราะห์", "พร้อมเพย์"];
export const emptyRefundAccount: RefundAccount = { bank: "", accountName: "", accountNumber: "" };
// Account numbers are 10–15 digits; a PromptPay number is a 10-digit phone or a 13-digit ID.
export function cleanRefundAccount(value: unknown): RefundAccount | null {
  const v = value as RefundAccount | null;
  if (!v || typeof v.bank !== "string" || typeof v.accountName !== "string" || typeof v.accountNumber !== "string") return null;
  const bank = v.bank.trim(), accountName = v.accountName.trim(), accountNumber = v.accountNumber.replace(/[\s-]/g, "");
  if (!refundBanks.includes(bank) || !accountName || accountName.length > 120 || !/^\d{10,15}$/.test(accountNumber)) return null;
  return { bank, accountName, accountNumber };
}
export const refundAccountError = "กรุณากรอกบัญชีรับเงินมัดจำคืนให้ครบ: ธนาคาร ชื่อบัญชี และเลขบัญชี 10–15 หลัก";
