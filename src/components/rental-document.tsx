import Image from "next/image";
import { returnDay, type ScheduleRecord } from "@/lib/schedule";
import { bankByName } from "@/lib/banks";
import BankBadge from "./bank-badge";
import type { RentalDocumentDefaults } from "@/lib/store-settings";

export type Quote = { rental: number; deposit: number; shipping: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string };
export type StoreInfo = { logoImage: string; lineUrl: string; instagramUrl: string; rentalRules: string[]; rentalDocument: RentalDocumentDefaults };
export type DocRow = { _id: string; name: string; phone: string; address: string; start: string; end: string; days: number; schedule?: ScheduleRecord | null; verification?: { mode: "identity"; status: string } | null; deliveryFee: number; quote?: Partial<Quote>; items: { id: number; name: string; sku: string; image: string; dailyRate: number | null; rentalPrice?: number | null }[]; createdAt: string };
// Price for the whole rental: the package price saved with the booking, else the old per-day rate × days.
export const itemPrice = (item: DocRow["items"][number], days: number) => item.rentalPrice ?? (item.dailyRate === null ? null : item.dailyRate * days);
export const dateLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
export const money = (value: number | null) => value === null ? "สอบถามราคา" : value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function safeUrl(value: string) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
const blankQuote = (row: DocRow, defaults: RentalDocumentDefaults): Quote => ({ rental: row.items.every(item => itemPrice(item, row.days) !== null) ? row.items.reduce((sum, item) => sum + (itemPrice(item, row.days) || 0), 0) : 0, shipping: row.deliveryFee || 0, ...defaults, ...(row.verification?.mode === "identity" ? { deposit: 0 } : {}) });
export function quoteForRow(row: DocRow, defaults: RentalDocumentDefaults): Quote {
  const quote = { ...blankQuote(row, defaults), ...row.quote };
  for (const key of ["bank", "accountName", "accountNumber", "qrImage", "returnAddress", "returnPhone", "returnMethod"] as const) {
    if (!quote[key]) quote[key] = defaults[key];
  }
  return quote;
}

export function RentalDocument({ row, quote, store, printOnly = false }: { row: DocRow; quote: Quote; store: StoreInfo; printOnly?: boolean }) {
  const dayMonth = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  return <article className="rental-paper" id={printOnly ? undefined : "rental-paper"}>
    <header className="rental-paper-brand"><div className="rental-paper-wordmark">{store.logoImage && <Image unoptimized src={store.logoImage} alt="" width={76} height={76} />}<span><strong>CHARM BLESS <i>Rental</i></strong><small>CLOTHES FOR SPECIAL MOMENTS</small></span></div><div className="rental-paper-title"><strong>ใบรายละเอียดการเช่า</strong><small>RENTAL DETAILS</small></div></header>
    <div className="rental-paper-columns">
      <section className="rental-paper-section"><h3>ข้อมูลลูกค้า</h3><p><b>ชื่อ–นามสกุลผู้เช่า</b><span>{row.name}</span></p><p><b>เบอร์โทรศัพท์</b><span>{row.phone}</span></p><p><b>ที่อยู่สำหรับจัดส่ง</b><span>{row.address || "รับเองที่ร้าน"}</span></p></section>
      <section className="rental-paper-section"><h3>ข้อมูลการเช่า</h3><p><b>วันที่จอง</b><span>{dateLabel(row.createdAt)}</span></p><p><b>กำหนดคืน</b><span>{dateLabel(row.end)}</span></p><p><b>วันใช้งาน</b><span>{dayMonth(row.start)}–{dayMonth(row.end)}</span></p><p><b>ระยะเวลาเช่า</b><span>{row.days} วัน</span></p></section>
    </div>
    <section className="rental-paper-section rental-paper-items"><h3>รายการสินค้าเช่า</h3><table><thead><tr><th>ลำดับ</th><th>รูป</th><th>รหัสสินค้า / รายการ</th><th>จำนวน</th><th>ราคาเช่า (บาท)</th></tr></thead><tbody>{row.items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.image ? <Image unoptimized src={item.image} alt="" width={45} height={56} /> : <span>—</span>}</td><td><b>{item.sku}</b><span>{item.name}</span></td><td>1</td><td>{itemPrice(item, row.days) === null ? "สอบถาม" : money(itemPrice(item, row.days))}</td></tr>)}</tbody></table></section>
    <div className="rental-paper-columns rental-paper-payment-row">
      <section className="rental-paper-section rental-paper-total"><h3>สรุปยอดค่าเช่า</h3><p><span>ค่าเช่ารวม</span><b>{money(quote.rental)}</b></p><p><span>เงินมัดจำ{row.verification?.mode === "identity" && quote.deposit === 0 ? " (ยืนยันตัวตนแทน)" : ""}</span><b>{money(quote.deposit)}</b></p><p><span>ค่าจัดส่ง</span><b>{money(quote.shipping)}</b></p><strong><span>ยอดรวมสุทธิ</span><b>{money(quote.rental + quote.deposit + quote.shipping)} บาท</b></strong></section>
      <section className="rental-paper-section rental-paper-bank"><h3>ช่องทางชำระเงิน</h3><div><span className="rental-paper-qr">{quote.qrImage && safeUrl(quote.qrImage) ? <Image unoptimized src={safeUrl(quote.qrImage)} alt="QR ชำระเงิน" width={130} height={130} /> : <>QR<br />ชำระเงิน</>}</span><p><b>ข้อมูลบัญชีร้าน</b><span>ธนาคาร　:　{bankByName(quote.bank) && <BankBadge code={bankByName(quote.bank)!.code} size={18} />} {quote.bank || "กรอกชื่อธนาคาร"}</span><span>เลขที่บัญชี　:　{quote.accountNumber || "กรอกเลขบัญชี"}</span><span>ชื่อบัญชี　:　{quote.accountName || "กรอกชื่อบัญชี"}</span></p></div><small>ตรวจสอบยอดและบัญชีก่อนโอน</small></section>
    </div>
    <div className="rental-paper-reminder"><strong>ส่งคืนภายในวันที่กำหนด {dateLabel(returnDay(row))} ก่อน 18:00 น.</strong><span>แจ้งเลขพัสดุทาง Inbox ภายใน 20:00 น.</span></div>
    <section className="rental-paper-section rental-paper-rules"><h3>เงื่อนไขการเช่า</h3><ol>{store.rentalRules.slice(0, 5).map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}</ol></section>
    <section className="rental-paper-section rental-paper-return"><h3>ข้อมูลสำหรับส่งคืน</h3><div><strong>CHARM BLESS Rental</strong><span>ที่อยู่ส่งคืน　:　{quote.returnAddress || "ติดต่อร้านเพื่อขอที่อยู่ส่งคืน"}</span><span>เบอร์โทรศัพท์　:　{quote.returnPhone || "ติดต่อร้านทาง LINE"}</span><span>วิธีส่งคืน　:　{quote.returnMethod || "ไปรษณีย์ / Flash / KEX"}</span></div></section>
    <footer className="rental-paper-social">{store.instagramUrl && <span>◎ {store.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "")}</span>}<small>โปรดตรวจสอบข้อมูลก่อนชำระเงิน</small></footer>
  </article>;
}

