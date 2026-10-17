"use client";
import { Icon } from "./ui/icon";

import { useState, type ReactNode } from "react";
import RentalRules from "./rental-rules";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { LINE_CONTACT_URL } from "@/lib/contact";

export type BookingItem = { id: number; name: string; image?: string; dailyRate?: number | null; unavailable?: boolean };

export function rentalDays(start: string, end: string) {
  if (!start || !end) return 0;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  return Number.isFinite(days) && days > 0 ? days : 0;
}
export function validPhone(value: string) {
  const phone = value.replace(/[\s()-]/g, "");
  return /^0[689]\d{8}$/.test(phone) || /^\+[1-9]\d{7,14}$/.test(phone);
}
const shortDate = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export default function BookingForm({ items, initialStart = "", initialEnd = "", trigger, onRemove }: { items: BookingItem[]; initialStart?: string; initialEnd?: string; trigger?: ReactNode; onRemove?: (id: number) => void }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [method, setMethod] = useState("pickup");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const days = rentalDays(start,end);
  const hasRates = items.length > 0 && items.every(item => typeof item.dailyRate === "number");
  const daily = items.reduce((sum,item) => sum + (item.dailyRate ?? 0),0);
  const blocked = items.some(item => item.unavailable);
  const delivery = method === "ems" ? 50 : 0;
  return <Dialog.Root onOpenChange={open => { if(open) {setStart(initialStart);setEnd(initialEnd);setReview(false);setError("");} }}>{trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : <Dialog.Trigger className="pill pill-pink mt-4 w-full" disabled={items.length === 0}>ขอจองชุด</Dialog.Trigger>}<Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-panel booking-panel"><Dialog.Title className="text-xl font-semibold">{review ? "ตรวจสอบคำขอจอง" : "ขอจองชุด"}</Dialog.Title><Dialog.Description className="mt-2 text-xs leading-6 text-slate-500">ช่องที่มี * ต้องกรอก · ร้านต้องยืนยันชุดว่างและราคาก่อนการจอง</Dialog.Description><Dialog.Close className="dialog-close" aria-label="ปิดฟอร์มจอง"><Icon name="close" /></Dialog.Close>
    <div className="booking-items">{items.length === 0 && <p className="booking-help" role="status">ตะกร้ายังว่าง กรุณาเลือกสินค้าและเพิ่มลงตะกร้าก่อนขอจอง</p>}{items.map(item => <div key={item.id}>{item.image && <Image className="booking-product-photo" src={item.image} alt={item.name} width={60} height={78} />}<div className="booking-product-text"><strong>{item.name}</strong>{onRemove && <button type="button" className="booking-remove" aria-label={`นำ ${item.name} ออก`} onClick={() => {onRemove(item.id);setReview(false);}}>นำออก</button>}<span>{item.unavailable ? "ช่วงนี้เต็ม" : "รอร้านเช็กวันว่าง"}</span></div></div>)}</div>
    <p className="booking-price">ค่าเช่ารวมต่อวัน (ประมาณ) {hasRates ? `฿${daily.toLocaleString("th-TH")}` : "รอร้านแจ้งราคา"}<small>ยังไม่รวมมัดจำ/ค่าส่ง · ร้านยืนยันราคาจริงอีกที</small></p>
    {review ? <div className="booking-review"><dl><dt>วันที่ใช้งาน</dt><dd>รับ {shortDate(start)} – คืน {shortDate(end)} · {days} วัน</dd><dt>ผู้ติดต่อ</dt><dd>{name} · {phone}</dd><dt>รับชุด</dt><dd>{method === "pickup" ? "รับเองที่ร้าน" : method === "ems" ? "ไปรษณีย์ / EMS (+฿50)" : "แมสเซนเจอร์ (ค่าส่งตามระยะทาง)"}</dd>{method !== "pickup" && <><dt>ที่อยู่</dt><dd>{address}</dd></>}{pin && <><dt>หมุด</dt><dd>{pin}</dd></>}{note && <><dt>โน้ตถึงร้าน</dt><dd>{note}</dd></>}</dl><p className="booking-notice" role="status">ตรวจข้อมูลได้แล้ว แต่ยังไม่ได้ส่งคำขอ ระบบนี้ยังไม่เชื่อมร้าน และไม่ได้ยืนยันการจอง ข้อมูลกรอกไว้เฉพาะหน้าต่างนี้</p><a href={LINE_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="pill pill-pink w-full">เปิด LINE เพื่อคุยกับร้าน</a><p className="booking-help">ข้อมูลฟอร์มยังไม่ถูกส่งไป LINE กรุณาแจ้งรายละเอียดกับร้านในแชต</p><button className="pill pill-outline w-full" onClick={() => setReview(false)}>กลับไปแก้ไข</button></div> : <form className="booking-form" onSubmit={e => {e.preventDefault();setError("");if(!items.length){setError("กรุณาเพิ่มสินค้าก่อนขอจอง");return;}if(!days){setError("วันคืนชุดต้องอยู่หลังวันรับชุดอย่างน้อย 1 วัน");return;}if(!name.trim()){setError("กรุณากรอกชื่อ");return;}if(!validPhone(phone)){setError("กรอกเบอร์มือถือไทย 10 หลัก หรือเบอร์ต่างประเทศที่ขึ้นต้นด้วย +");return;}if(method !== "pickup" && !address.trim()){setError("กรุณากรอกที่อยู่จัดส่ง");return;}if(blocked){setError("มีรายการที่ช่วงนี้เต็ม กรุณาติดต่อร้านหรือเลือกชุดอื่น");return;}setReview(true);}}>
      <div className="booking-date-grid"><label>วันรับชุด *<input type="date" required value={start} onChange={e => {setStart(e.target.value);if(end && end <= e.target.value)setEnd("");}} /></label><label>วันคืนชุด *<input type="date" required min={start ? new Date(Date.parse(`${start}T00:00:00Z`)+86400000).toISOString().slice(0,10) : undefined} value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      {days > 0 && <p className="booking-date-summary">รับ {shortDate(start)} – คืน {shortDate(end)} · คิดเป็นเช่า {days} วัน{hasRates && <strong> ค่าเช่าประมาณ ฿{(daily*days+delivery).toLocaleString("th-TH")}{delivery > 0 && " (รวมค่าส่ง EMS ฿50)"}</strong>}</p>}
      <label>ชื่อ *<input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อผู้ติดต่อ" /></label>
      <label>เบอร์โทร *<input type="tel" required autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} onBlur={e => e.target.setCustomValidity(validPhone(e.target.value) ? "" : "กรอกเบอร์มือถือไทย หรือเบอร์ที่ขึ้นต้นด้วย + และรหัสประเทศ")} onInput={e => e.currentTarget.setCustomValidity("")} placeholder="08xxxxxxxx หรือ +668xxxxxxxx" /></label><p className="booking-help">เบอร์มือถือไทย หรือเบอร์ต่างประเทศที่ขึ้นต้นด้วย +<br />Outside Thailand? Start with + and your country code</p>
      <details className="booking-privacy"><summary>ชื่อและเบอร์นี้ใช้สำหรับติดต่อเรื่องการเช่า · อ่านเพิ่ม</summary><p>แบบฟอร์มตัวอย่างยังไม่ส่งหรือบันทึกข้อมูลเข้าระบบร้าน นโยบายการใช้ข้อมูลฉบับจริงของ Charm Bless ต้องจัดทำก่อนเปิดรับคำขอ</p></details>
      <fieldset><legend>อยากรับชุดยังไง</legend>{[["pickup","รับเองที่ร้าน","ฟรี","ไม่มีค่าส่ง"],["ems","ส่งไปรษณีย์ / EMS","+฿50","ร้านส่งให้ บวกค่าส่งในบิล"],["messenger","แมสเซนเจอร์ (Grab / LINE MAN)","ตามระยะทาง","ค่าส่งตามระยะทาง · ลูกค้าจ่ายปลายทาง"]].map(([value,title,price,description]) => <label className={`booking-method ${method === value ? "selected" : ""}`} key={value}><input type="radio" name="delivery" value={value} checked={method === value} onChange={() => setMethod(value)} /><span><strong>{title}</strong><small>{description}</small></span><b>{price}</b></label>)}</fieldset>
      {method !== "pickup" && <><label>ที่อยู่จัดส่ง *<textarea required autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="บ้านเลขที่ อาคาร ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด และรหัสไปรษณีย์" /></label><label>หมุดตำแหน่ง (ไม่บังคับ)<input type="url" value={pin} onChange={e => setPin(e.target.value)} placeholder="วางลิงก์หมุดจาก Google Maps" /></label><a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="booking-map-link">เปิดแผนที่เพื่อเลือกหมุด <Icon name="arrow" /></a><p className="booking-help">เลือกจุดในแผนที่ แล้วคัดลอกลิงก์มาใส่ · {pin ? "แนบลิงก์หมุดแล้ว" : "ยังไม่ได้แนบหมุด"}</p></>}
      <label>โน้ตถึงร้าน (ไม่บังคับ)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="เช่น งานรับปริญญา / สอบถามเพิ่มเติม…" /></label><p className="booking-help">ไม่ต้องใส่ข้อมูลสุขภาพหรือเลขบัตรประชาชน</p>
      <details className="booking-rules"><summary>กติกาของร้าน (อ่านก่อนส่งคำขอ)</summary><RentalRules /></details><label className="booking-acknowledgment"><input type="checkbox" required />อ่านและยอมรับกฎการเช่า พร้อมให้ร้านยืนยันรายละเอียดก่อนจอง *</label>
      {error && <p className="booking-error" role="alert">{error}</p>}<p className="booking-notice">ยังไม่เชื่อมระบบส่งคำขอ กดเพื่อดูข้อมูลที่กรอกก่อนส่งเท่านั้น</p><button type="submit" disabled={items.length === 0} className="pill pill-pink w-full disabled:opacity-40 disabled:cursor-not-allowed">ตรวจสอบคำขอจอง</button>
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
