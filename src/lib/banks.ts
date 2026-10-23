// Client-safe: Thai banks with their brand colour and logo (white marks from public/banks-logo-master, drawn on the colour).
export type Bank = { code: string; name: string; color: string; logo: string | null };
const logo = (code: string) => `/banks-logo-master/th/${code}.svg`;
export const banks: Bank[] = [
  { code: "kbank", name: "กสิกรไทย", color: "#138f2d", logo: logo("kbank") },
  { code: "scb", name: "ไทยพาณิชย์", color: "#4e2e7f", logo: logo("scb") },
  { code: "bbl", name: "กรุงเทพ", color: "#1e4598", logo: logo("bbl") },
  { code: "ktb", name: "กรุงไทย", color: "#1ba5e1", logo: logo("ktb") },
  { code: "bay", name: "กรุงศรีอยุธยา", color: "#fec43b", logo: logo("bay") },
  // banks.json gives ttb a near-white colour, which hides its white mark; its brand blue is used instead.
  { code: "ttb", name: "ทหารไทยธนชาต (ttb)", color: "#0050f0", logo: logo("ttb") },
  { code: "gsb", name: "ออมสิน", color: "#eb198d", logo: logo("gsb") },
  { code: "baac", name: "ธ.ก.ส.", color: "#4b9b1d", logo: logo("baac") },
  { code: "uob", name: "ยูโอบี", color: "#0b3979", logo: logo("uob") },
  { code: "cimb", name: "ซีไอเอ็มบี ไทย", color: "#7e2f36", logo: logo("cimb") },
  { code: "kk", name: "เกียรตินาคินภัทร", color: "#199cc5", logo: logo("kk") },
  { code: "lhb", name: "แลนด์ แอนด์ เฮ้าส์", color: "#6d6e71", logo: logo("lhb") },
  { code: "ghb", name: "อาคารสงเคราะห์", color: "#f57d23", logo: logo("ghb") },
  { code: "tisco", name: "ทิสโก้", color: "#12549f", logo: logo("tisco") },
  { code: "ibank", name: "อิสลามแห่งประเทศไทย", color: "#184615", logo: logo("ibank") },
  { code: "tcrb", name: "ไทยเครดิต", color: "#0a4ab3", logo: logo("tcrb") },
  { code: "icbc", name: "ไอซีบีซี (ไทย)", color: "#c50f1c", logo: logo("icbc") },
  { code: "citi", name: "ซิตี้แบงก์", color: "#1583c7", logo: logo("citi") },
  { code: "hsbc", name: "เอชเอสบีซี", color: "#fd0d1b", logo: logo("hsbc") },
  { code: "sc", name: "สแตนดาร์ดชาร์เตอร์ด", color: "#0f6ea1", logo: logo("sc") },
  { code: "promptpay", name: "พร้อมเพย์", color: "#113566", logo: null },
];
export const bankByCode = (code: string) => banks.find(bank => bank.code === code);
// Bills store the bank by name, so a saved name finds its logo again.
export const bankByName = (name: string) => banks.find(bank => bank.name === name.trim()) || banks.find(bank => name.trim() && (bank.name.includes(name.trim()) || name.includes(bank.name)));

// The shop's receiving accounts. Each is used on the days of the month in [fromDay, toDay], e.g. 1–15 and 16–31.
export type ShopAccount = { id: string; bankCode: string; accountName: string; accountNumber: string; qrImage: string; fromDay: number; toDay: number };
const validUrl = (value: string) => { if (!value) return true; try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; } };
export function validShopAccounts(value: unknown): value is ShopAccount[] {
  if (!Array.isArray(value) || value.length > 12) return false;
  const day = (item: unknown) => Number.isSafeInteger(item) && (item as number) >= 1 && (item as number) <= 31;
  return value.every(item => { const v = item as ShopAccount; return !!v && typeof v.id === "string" && v.id.length <= 60 && !!bankByCode(v.bankCode) && typeof v.accountName === "string" && v.accountName.length <= 120 && typeof v.accountNumber === "string" && v.accountNumber.length <= 40 && typeof v.qrImage === "string" && v.qrImage.length <= 1000 && validUrl(v.qrImage) && day(v.fromDay) && day(v.toDay) && v.fromDay <= v.toDay; });
}
// Day ranges that cover the same day: the earlier account would always win, so the shop is warned.
export const overlappingAccounts = (accounts: ShopAccount[]) => accounts.flatMap((a, i) => accounts.slice(i + 1).filter(b => a.fromDay <= b.toDay && b.fromDay <= a.toDay).map(b => [a, b] as const));
// The account for a day of the month; a day no range covers falls back to the first account.
export const accountForDay = (accounts: ShopAccount[], dayOfMonth: number) => accounts.find(account => account.fromDay <= dayOfMonth && dayOfMonth <= account.toDay) || accounts[0] || null;
