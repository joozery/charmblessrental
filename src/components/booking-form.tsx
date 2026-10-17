"use client";
import { Icon } from "./ui/icon";

import { useState, type ReactNode } from "react";
import RentalRules from "./rental-rules";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { useStoreSettings } from "@/components/store-settings-provider";

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
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const settings = useStoreSettings();
  const days = rentalDays(start,end);
  const hasRates = items.length > 0 && items.every(item => typeof item.dailyRate === "number");
  const daily = items.reduce((sum,item) => sum + (item.dailyRate ?? 0),0);
  const blocked = items.some(item => item.unavailable);
  const delivery = method === "ems" ? settings.emsFee : 0;
  async function sendRequest() {
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map(item => ({ id: item.id })), start, end, name, phone, method, address, pin, note, acceptPrivacy }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
      setRequestId(data.requestId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSubmitting(false); }
  }
  const reviewContent = requestId ? <div className="booking-review"><p className="booking-notice" role="status">ส่งคำขอแล้ว เลขที่ {requestId} · ร้านจะตรวจสอบคิวและติดต่อกลับเพื่อยืนยันก่อนชำระเงิน</p><a href={settings.lineUrl} target="_blank" rel="noopener noreferrer" className="pill pill-pink w-full">เปิด LINE ติดต่อร้าน</a></div> : <div className="booking-review"><dl>{[["วันที่ใช้งาน", `รับ ${shortDate(start)} – คืน ${shortDate(end)} · ${days} วัน`], ["ผู้ติดต่อ", `${name} · ${phone}`], ["รับชุด", method === "pickup" ? "รับเองที่ร้าน" : method === "ems" ? `ไปรษณีย์ / EMS (+฿${settings.emsFee.toLocaleString("th-TH")})` : "แมสเซนเจอร์ (ค่าส่งตามระยะทาง)"], ...(method !== "pickup" ? [["ที่อยู่", address]] : []), ...(pin ? [["หมุด", pin]] : []), ...(note ? [["โน้ตถึงร้าน", note]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="booking-notice" role="status">คำขอนี้จะส่งให้ร้านตรวจสอบคิวและติดต่อยืนยันก่อน ยังไม่ใช่การจองที่ยืนยันแล้ว</p>{error && <p className="booking-error" role="alert">{error}</p>}<button type="button" disabled={submitting} onClick={sendRequest} className="pill pill-pink w-full">{submitting ? "กำลังส่งคำขอ…" : "ส่งคำขอให้ร้านตรวจสอบ"}</button><button type="button" className="pill pill-outline w-full" disabled={submitting} onClick={() => setReview(false)}>กลับไปแก้ไข</button></div>;
  return <Dialog.Root onOpenChange={open => { if(open) {setStart(initialStart);setEnd(initialEnd);setReview(false);setError("");setRequestId("");setAcceptPrivacy(false);} }}>{trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : <Dialog.Trigger className="pill pill-pink mt-4 w-full" disabled={items.length === 0}>ขอจองชุด</Dialog.Trigger>}<Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-panel booking-panel"><Dialog.Title className="text-xl font-semibold">{review ? "ตรวจสอบคำขอจอง" : "ขอจองชุด"}</Dialog.Title><Dialog.Description className="mt-2 text-xs leading-6 text-slate-500">ช่องที่มี * ต้องกรอก · ร้านต้องยืนยันชุดว่างและราคาก่อนการจอง</Dialog.Description><Dialog.Close className="dialog-close" aria-label="ปิดฟอร์มจอง"><Icon name="close" /></Dialog.Close>
    <div className="booking-items">{items.length === 0 && <p className="booking-help" role="status">ตะกร้ายังว่าง กรุณาเลือกสินค้าและเพิ่มลงตะกร้าก่อนขอจอง</p>}{items.map(item => <div key={item.id}>{item.image && <Image className="booking-product-photo" src={item.image} alt={item.name} width={60} height={78} />}<div className="booking-product-text"><strong>{item.name}</strong>{onRemove && <button type="button" className="booking-remove" aria-label={`นำ ${item.name} ออก`} onClick={() => {onRemove(item.id);setReview(false);}}>นำออก</button>}<span>{item.unavailable ? "ช่วงนี้เต็ม" : "ร้านจะตรวจสอบคิวก่อนยืนยัน"}</span></div></div>)}</div>
    <p className="booking-price">ค่าเช่ารวมต่อวัน (ประมาณ) {hasRates ? `฿${daily.toLocaleString("th-TH")}` : "รอร้านแจ้งราคา"}<small>ยังไม่รวมมัดจำ/ค่าส่ง · ร้านยืนยันราคาจริงอีกที</small></p>
{review ? reviewContent : <form className="booking-form" onSubmit={e => {e.preventDefault();setError("");if(!items.length){setError("กรุณาเพิ่มสินค้าก่อนขอจอง");return;}if(!days){setError("วันคืนชุดต้องอยู่หลังวันรับชุดอย่างน้อย 1 วัน");return;}if(!name.trim()){setError("กรุณากรอกชื่อ");return;}if(!validPhone(phone)){setError("กรอกเบอร์มือถือไทย 10 หลัก หรือเบอร์ต่างประเทศที่ขึ้นต้นด้วย +");return;}if(method !== "pickup" && !address.trim()){setError("กรุณากรอกที่อยู่จัดส่ง");return;}if(blocked){setError("มีรายการที่ช่วงนี้เต็ม กรุณาติดต่อร้านหรือเลือกชุดอื่น");return;}setReview(true);}}>
      <div className="booking-date-grid"><label>วันรับชุด *<input type="date" required value={start} onChange={e => {setStart(e.target.value);if(end && end <= e.target.value)setEnd("");}} /></label><label>วันคืนชุด *<input type="date" required min={start ? new Date(Date.parse(`${start}T00:00:00Z`)+86400000).toISOString().slice(0,10) : undefined} value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      {days > 0 && <p className="booking-date-summary">รับ {shortDate(start)} – คืน {shortDate(end)} · คิดเป็นเช่า {days} วัน{hasRates && <strong> ค่าเช่าประมาณ ฿{(daily*days+delivery).toLocaleString("th-TH")}{delivery > 0 && ` (รวมค่าส่ง EMS ฿${settings.emsFee.toLocaleString("th-TH")})`}</strong>}</p>}
      <label>ชื่อ *<input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อผู้ติดต่อ" /></label>
      <label>เบอร์โทร *<input type="tel" required autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} onBlur={e => e.target.setCustomValidity(validPhone(e.target.value) ? "" : "กรอกเบอร์มือถือไทย หรือเบอร์ที่ขึ้นต้นด้วย + และรหัสประเทศ")} onInput={e => e.currentTarget.setCustomValidity("")} placeholder="08xxxxxxxx หรือ +668xxxxxxxx" /></label><p className="booking-help">เบอร์มือถือไทย หรือเบอร์ต่างประเทศที่ขึ้นต้นด้วย +<br />Outside Thailand? Start with + and your country code</p>
      <details className="booking-privacy"><summary>ข้อมูลติดต่อใช้ทำอะไร · อ่านเพิ่ม</summary><p>ร้านจะบันทึกชื่อ เบอร์โทร ที่อยู่จัดส่ง (ถ้ามี) และรายละเอียดคำขอ เพื่อประสานงานการเช่าและติดต่อกลับ คำขอจะยังไม่ยืนยันจนกว่าร้านตรวจสอบและแจ้งกลับ</p></details>
      <fieldset><legend>อยากรับชุดยังไง</legend>{[["pickup","รับเองที่ร้าน","ฟรี","ไม่มีค่าส่ง"],["ems","ส่งไปรษณีย์ / EMS",`+฿${settings.emsFee.toLocaleString("th-TH")}`,"ร้านส่งให้ บวกค่าส่งในบิล"],["messenger","แมสเซนเจอร์ (Grab / LINE MAN)","ตามระยะทาง","ค่าส่งตามระยะทาง · ลูกค้าจ่ายปลายทาง"]].map(([value,title,price,description]) => <label className={`booking-method ${method === value ? "selected" : ""}`} key={value}><input type="radio" name="delivery" value={value} checked={method === value} onChange={() => setMethod(value)} /><span><strong>{title}</strong><small>{description}</small></span><b>{price}</b></label>)}</fieldset>
      {method !== "pickup" && <><label>ที่อยู่จัดส่ง *<textarea required autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="บ้านเลขที่ อาคาร ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด และรหัสไปรษณีย์" /></label><label>หมุดตำแหน่ง (ไม่บังคับ)<input type="url" value={pin} onChange={e => setPin(e.target.value)} placeholder="วางลิงก์หมุดจาก Google Maps" /></label><a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="booking-map-link">เปิดแผนที่เพื่อเลือกหมุด <Icon name="arrow" /></a><p className="booking-help">เลือกจุดในแผนที่ แล้วคัดลอกลิงก์มาใส่ · {pin ? "แนบลิงก์หมุดแล้ว" : "ยังไม่ได้แนบหมุด"}</p></>}
      <label>โน้ตถึงร้าน (ไม่บังคับ)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="เช่น งานรับปริญญา / สอบถามเพิ่มเติม…" /></label><p className="booking-help">ไม่ต้องใส่ข้อมูลสุขภาพหรือเลขบัตรประชาชน</p>
      <details className="booking-rules"><summary>กติกาของร้าน (อ่านก่อนส่งคำขอ)</summary><RentalRules rules={settings.rentalRules} /></details><label className="booking-acknowledgment"><input type="checkbox" required />อ่านและยอมรับกฎการเช่า *</label><label className="booking-acknowledgment"><input type="checkbox" required checked={acceptPrivacy} onChange={event => setAcceptPrivacy(event.target.checked)} />ยินยอมให้ร้านบันทึกข้อมูลติดต่อเพื่อจัดการคำขอเช่านี้ *</label>
      {error && <p className="booking-error" role="alert">{error}</p>}<p className="booking-notice">ส่งคำขอให้ร้านตรวจสอบได้ที่นี่ ร้านจะติดต่อกลับเพื่อยืนยันคิวและราคาก่อน</p><button type="submit" disabled={items.length === 0} className="pill pill-pink w-full disabled:opacity-40 disabled:cursor-not-allowed">ตรวจสอบคำขอจอง</button>
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
