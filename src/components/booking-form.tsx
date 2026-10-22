"use client";
import { Icon } from "./ui/icon";

import { useState, type ReactNode } from "react";
import RentalRules from "./rental-rules";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { useStoreSettings } from "@/components/store-settings-provider";
import { priceFor, tiersOf, type RentalPricing } from "@/lib/pricing";
import { mapsLink } from "@/lib/delivery";
import { enabledOptions, freeEligible, shippingFor, standardFee } from "@/lib/shipping";
import { addDays, planFor, returnMethods, countUseDays, type ReturnMethod } from "@/lib/schedule";
import RentalTimeline from "./rental-timeline";
import { identityAllowed } from "@/lib/identity";

export type BookingItem = { id: number; name: string; image?: string; pricing?: RentalPricing | null; shippingFee?: number | null; category?: string; unavailable?: boolean };

// Days of use, both ends counted: 19–28 Nov is 10 days.
export const rentalDays = countUseDays;
export function validPhone(value: string) {
  const phone = value.replace(/[\s()-]/g, "");
  return /^0[689]\d{8}$/.test(phone) || /^\+[1-9]\d{7,14}$/.test(phone);
}
const baht = (value: number) => `฿${value.toLocaleString("th-TH")}`;
// Kept only in this browser so a returning customer does not retype their details.
const contactKey = "charmbless:booking-contact";
type SavedContact = { name: string; phone: string; address: string; pin: string; method: string; returnMethod?: ReturnMethod };
function loadContact(): SavedContact | null { try { const value = JSON.parse(localStorage.getItem(contactKey) || "null"); return value && typeof value.name === "string" ? value : null; } catch { return null; } }
function saveContact(value: SavedContact) { try { localStorage.setItem(contactKey, JSON.stringify(value)); } catch { /* private mode */ } }
function forgetContact() { try { localStorage.removeItem(contactKey); } catch { /* private mode */ } }
const steps = ["วันเช่า", "รับชุด", "ติดต่อและยืนยัน"];
const shortDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "—";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

export default function BookingForm({ items, initialStart = "", initialEnd = "", initialReturn, initialMethod, trigger, onRemove }: { items: BookingItem[]; initialStart?: string; initialEnd?: string; initialReturn?: ReturnMethod; initialMethod?: string; trigger?: ReactNode; onRemove?: (id: number) => void }) {
  const [step, setStep] = useState(0);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [method, setMethod] = useState("pickup");
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>(initialReturn || "parcel");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [depositMode, setDepositMode] = useState<"deposit" | "identity">("deposit");
  const [remembered, setRemembered] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<{ km: number; fee: number; inBill: boolean; for: string } | null>(null);
  const [quoteState, setQuoteState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const settings = useStoreSettings();
  const messenger = settings.messenger;
  const autoFee = messenger.enabled && !!messenger.origin;
  const spot = `${pin.trim()}|${address.trim()}`;
  const fresh = quote && quote.for === spot ? quote : null;
  async function priceDelivery(nextPin = pin) {
    const key = `${nextPin.trim()}|${address.trim()}`;
    if (!autoFee || method !== "messenger" || (!nextPin.trim() && address.trim().length < 10) || (quote?.for === key)) return;
    setQuoteState({ busy: true, error: "" });
    try {
      const response = await fetch("/api/delivery-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: nextPin.trim(), address: address.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "คำนวณค่าส่งไม่สำเร็จ");
      setQuote({ km: data.km, fee: data.fee, inBill: data.inBill, for: key }); setQuoteState({ busy: false, error: "" });
    } catch (cause) { setQuote(null); setQuoteState({ busy: false, error: cause instanceof Error ? cause.message : "คำนวณค่าส่งไม่สำเร็จ" }); }
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setQuoteState({ busy: false, error: "เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง กรุณาวางลิงก์หมุดแทน" }); return; }
    setQuoteState({ busy: true, error: "" });
    navigator.geolocation.getCurrentPosition(position => { const link = mapsLink({ lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) }); setPin(link); void priceDelivery(link); }, () => setQuoteState({ busy: false, error: "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาวางลิงก์หมุดจาก Google Maps แทน" }), { enableHighAccuracy: true, timeout: 10000 });
  }
  const days = rentalDays(start,end);
  const totalFor = (count: number) => { const prices = items.map(item => priceFor(item.pricing, count)); return items.length && prices.every(price => price !== null) ? prices.reduce<number>((sum, price) => sum + (price ?? 0), 0) : null; };
  // Before dates are picked the estimate uses each item's shortest package.
  const rentalTotal = totalFor(Math.max(days, 1));
  // Package buttons come from the items' own price tables (1 / 3 / 5 / 7 days…).
  const packageDays = [...new Set(items.flatMap(item => tiersOf(item.pricing).map(tier => tier.days)))].sort((a, b) => a - b).slice(0, 6);
  const packages = (packageDays.length ? packageDays : [1, 3, 5, 7]).map(count => ({ days: count, price: totalFor(count) }));
  const billedAs = days > 0 && packageDays.length && !packageDays.includes(days) ? packageDays.find(count => count > days) : undefined;
  const blocked = items.some(item => item.unavailable);
  const plan = days > 0 ? planFor(settings, start, end, method, returnMethod) : null;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const tooSoon = !!plan && plan.ship < todayKey;
  const canSkipDeposit = identityAllowed(settings.verification, rentalTotal, items.map(item => item.category || ""));
  const mode = canSkipDeposit ? depositMode : "deposit";
  const carriers = enabledOptions(settings);
  const free = freeEligible(settings, items.length);
  const missing = settings.freeShipping.enabled ? settings.freeShipping.minItems - items.length : 0;
  const quoteFor = (value: string) => shippingFor(settings, value, items, value === "messenger" && fresh?.inBill ? fresh.fee : null);
  const shipping = quoteFor(method);
  const delivery = shipping?.fee ?? 0;
  const feeText = (value: string) => { const quote = quoteFor(value); if (!quote) return ""; if (value === "pickup") return "ฟรี"; if (quote.fee === null) return value === "messenger" ? (fresh ? baht(fresh.fee) : "ตามระยะทาง") : ""; return quote.fee === 0 ? "ส่งฟรี" : quote.discount ? `+${baht(quote.fee)} (ลด ${baht(quote.discount)})` : `+${baht(quote.fee)}`; };
  const methodLabel = method === "messenger" ? (fresh ? `แมสเซนเจอร์ · ${fresh.km.toLocaleString("th-TH")} กม. (${fresh.inBill ? feeText("messenger") : `จ่ายแมสปลายทาง ${baht(fresh.fee)}`})` : "แมสเซนเจอร์ (ค่าส่งตามระยะทาง)") : `${shipping?.label || "รับเองที่ร้าน"}${method === "pickup" ? "" : ` (${feeText(method)})`}`;

  function problem(at: number) {
    if (at === 0) {
      if (!items.length) return "กรุณาเพิ่มสินค้าก่อนขอจอง";
      if (!start || !end) return "กรุณาเลือกวันเริ่มใช้งาน แล้วเลือกแพ็กเกจหรือวันใช้งานวันสุดท้าย";
      if (!days) return "วันใช้งานวันสุดท้ายต้องไม่อยู่ก่อนวันเริ่มใช้งาน";
      if (blocked) return "มีรายการที่ช่วงนี้เต็ม กรุณาติดต่อร้านหรือเลือกชุดอื่น";
    }
    if (at === 1 && !shipping) return "กรุณาเลือกวิธีรับชุด";
    if (at === 1 && tooSoon && plan) return `วิธีรับชุดนี้ร้านต้องส่งล่วงหน้า ${plan.lead} วัน กรุณาเลือกวิธีอื่น หรือเลื่อนวันเริ่มใช้งานเป็นตั้งแต่ ${shortDate(addDays(todayKey, plan.lead))}`;
    if (at === 1 && method !== "pickup" && !address.trim()) return "กรุณากรอกที่อยู่จัดส่ง";
    if (at === 2) {
      if (!name.trim()) return "กรุณากรอกชื่อ";
      if (!validPhone(phone)) return "กรอกเบอร์มือถือไทย 10 หลัก หรือเบอร์ต่างประเทศที่ขึ้นต้นด้วย +";
      if (!accepted) return "กรุณาติ๊กยอมรับกฎการเช่าและการใช้ข้อมูลติดต่อ";
    }
    return "";
  }
  function next() {
    const issue = problem(step); setError(issue);
    if (issue) { requestAnimationFrame(() => document.querySelector(".booking-panel .booking-error")?.scrollIntoView({ block: "center", behavior: "smooth" })); return; }
    if (step < 2) { setStep(step + 1); document.querySelector(".booking-panel")?.scrollTo({ top: 0 }); } else void sendRequest();
  }
  function goTo(target: number) { for (let at = 0; at < target; at++) { const issue = problem(at); if (issue) { setStep(at); setError(issue); return; } } setError(""); setStep(target); }
  async function sendRequest() {
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map(item => ({ id: item.id })), start, end, name, phone, method, returnMethod, depositMode: mode, address, pin, note, acceptPrivacy: accepted }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
      saveContact({ name: name.trim(), phone: phone.trim(), address: address.trim(), pin: pin.trim(), method, returnMethod });
      setRequestId(data.requestId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSubmitting(false); }
  }
  function opened() {
    setDepositMode("deposit"); setStart(initialStart); setEnd(initialEnd); setStep(0); if (initialReturn) setReturnMethod(initialReturn); if (initialMethod) setMethod(initialMethod); setError(""); setRequestId(""); setAccepted(false);
    const saved = loadContact();
    if (saved && !name && !phone) { setName(saved.name); setPhone(saved.phone); setAddress(saved.address); setPin(saved.pin); if (!initialMethod && ["pickup", "messenger", ...carriers.map(option => option.id)].includes(saved.method)) setMethod(saved.method); if (!initialReturn && saved.returnMethod && returnMethods.some(item => item.key === saved.returnMethod)) setReturnMethod(saved.returnMethod); setRemembered(true); }
  }

  const success = <div className="booking-review booking-success"><p className="booking-notice" role="status">ส่งคำขอเรียบร้อยแล้ว · ยังไม่ใช่การยืนยันจอง ร้านจะตรวจสอบคิวก่อน</p><div className="booking-request-code"><span>เลขที่คำขอของคุณ</span><strong>{requestId}</strong><button type="button" onClick={() => { void navigator.clipboard?.writeText(requestId).then(() => { setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); }).catch(() => undefined); }}>{copiedId ? "คัดลอกแล้ว ✓" : "คัดลอก"}</button></div><ol className="booking-next-steps"><li><b>1</b><span><strong>แอด LINE ร้าน</strong><small>กดปุ่มด้านล่างเพื่อเปิด LINE</small></span></li><li><b>2</b><span><strong>แจ้งเบอร์โทรที่ใช้จอง ({phone})</strong><small>พร้อมส่งเลขที่คำขอทางแชทเพื่อให้ร้านตรวจสอบ</small></span></li>{mode === "identity" && <li><b>✓</b><span><strong>ยืนยันตัวตนแทนเงินมัดจำ</strong><small>ร้านจะส่งลิงก์ให้ส่งรูปบัตรประชาชน เซลฟี่คู่บัตร และที่อยู่ ก่อนวันจัดส่ง</small></span></li>}<li><b>3</b><span><strong>รับใบรายละเอียดการเช่าและลิงก์ชำระเงิน</strong><small>ร้านจะส่งลิงก์บิลให้ทาง LINE ตรวจสอบยอดแล้วชำระเงินเพื่อยืนยันการจอง</small></span></li></ol><a href={settings.lineUrl} target="_blank" rel="noopener noreferrer" className="pill pill-pink w-full">แอด LINE และแจ้งเบอร์โทร</a></div>;

  const dates = <>
    <div className="booking-items">{items.length === 0 && <p className="booking-help" role="status">ตะกร้ายังว่าง กรุณาเลือกสินค้าและเพิ่มลงตะกร้าก่อนขอจอง</p>}{items.map(item => <div key={item.id}>{item.image && <Image className="booking-product-photo" src={item.image} alt={item.name} width={60} height={78} />}<div className="booking-product-text"><strong>{item.name}</strong>{onRemove && <button type="button" className="booking-remove" aria-label={`นำ ${item.name} ออก`} onClick={() => onRemove(item.id)}>นำออก</button>}<span>{item.unavailable ? "ช่วงนี้เต็ม" : "ร้านจะตรวจสอบคิวก่อนยืนยัน"}</span></div></div>)}</div>
    <label>วันเริ่มใช้งาน *<input type="date" min={todayKey} value={start} onChange={e => { const value = e.target.value; const length = days; setStart(value); setEnd(value && length ? addDays(value, length - 1) : end && end < value ? "" : end); }} /></label>
    <fieldset><legend>เช่ากี่วัน</legend><div className="booking-packages">{packages.map(item => <button type="button" key={item.days} className={days === item.days ? "is-selected" : ""} disabled={!start} aria-pressed={days === item.days} onClick={() => { setEnd(addDays(start, item.days - 1)); setError(""); }}><strong>{item.days} วัน</strong><small>{item.price === null ? "สอบถามราคา" : baht(item.price)}</small></button>)}</div>{!start && <p className="booking-help">เลือกวันเริ่มใช้งานก่อน แล้วกดเลือกแพ็กเกจ</p>}</fieldset>
    <label>วันใช้งานวันสุดท้าย *<input type="date" min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} /></label>
    {days > 0 && <p className="booking-date-summary">ใช้งาน {shortDate(start)} – {shortDate(end)} · {days} วัน{billedAs && <strong>คิดราคาแพ็กเกจ {billedAs} วัน (แพ็กเกจที่ใกล้ที่สุดที่ครอบคลุม)</strong>}</p>}
  </>;

  const receive = <>
    {settings.freeShipping.enabled && <p className={`booking-free${free ? " is-active" : ""}`}>{free ? `🎉 เช่าครบ ${settings.freeShipping.minItems} ตัว ส่งฟรีแบบมาตรฐาน · ขนส่งอื่นลด ${baht(standardFee(settings, items))}` : missing > 0 && `เช่าอีก ${missing} ตัว ส่งฟรีแบบมาตรฐาน`}</p>}
    <fieldset><legend>อยากรับชุดยังไง</legend>{[["pickup", "รับเองที่ร้าน", "ไม่มีค่าส่ง"], ...carriers.map(option => [option.id, option.label, `${option.description}${option.description ? " · " : ""}${option.standard ? "แบบมาตรฐาน" : "ร้านส่งให้"} บวกค่าส่งในบิล`]), ["messenger", "แมสเซนเจอร์ (Grab / LINE MAN)", autoFee ? `คิดตามระยะทางจากร้าน · ${messenger.inBill ? "รวมในบิล" : "จ่ายแมสปลายทาง"}` : "ค่าส่งตามระยะทาง · ลูกค้าจ่ายปลายทาง"]].map(([value, title, description]) => <label className={`booking-method ${method === value ? "selected" : ""}`} key={value}><input type="radio" name="delivery" value={value} checked={method === value} onChange={() => setMethod(value)} /><span><strong>{title}</strong><small>{description}</small></span><b>{feeText(value)}</b></label>)}</fieldset>
    {method !== "pickup" && <>
      <label>ที่อยู่จัดส่ง *<textarea autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} onBlur={() => void priceDelivery()} placeholder="บ้านเลขที่ อาคาร ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด และรหัสไปรษณีย์" /></label>
      <label>หมุดตำแหน่ง {method === "messenger" ? "(แนะนำ ช่วยให้คิดค่าส่งแม่นขึ้น)" : "(ไม่บังคับ)"}<input type="url" value={pin} onChange={e => setPin(e.target.value)} onBlur={() => void priceDelivery()} placeholder="วางลิงก์หมุดจาก Google Maps" /></label>
      <p className="booking-help"><a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="booking-map-link">เปิด Google Maps <Icon name="arrow" /></a> เลือกจุดแล้วกดแชร์ คัดลอกลิงก์มาวาง</p>
      {method === "messenger" && <div className="booking-delivery">{messenger.description && <p>{messenger.description}</p>}{autoFee && <>
        <div className="booking-delivery-actions"><button type="button" onClick={useMyLocation} disabled={quoteState.busy}><Icon name="map" />ใช้ตำแหน่งปัจจุบัน</button><button type="button" onClick={() => void priceDelivery()} disabled={quoteState.busy || (!pin.trim() && address.trim().length < 10)}>{quoteState.busy ? "กำลังคำนวณ…" : "คำนวณค่าส่ง"}</button></div>
        {fresh ? <p className="booking-delivery-result" role="status">ระยะทางประมาณ <b>{fresh.km.toLocaleString("th-TH")} กม.</b> · ค่าส่ง <b>{baht(fresh.fee)}</b> {fresh.inBill ? "(รวมในบิล)" : "(จ่ายแมสปลายทาง)"}<small>ค่าประมาณจากระยะทางจริง ร้านจะยืนยันยอดในบิลอีกครั้ง</small></p>
          : quoteState.error ? <p className="booking-delivery-error" role="alert">{quoteState.error}</p>
          : <p className="booking-help">แนบหมุดหรือกรอกที่อยู่ให้ครบ ระบบจะคำนวณค่าส่งจากระยะทางให้อัตโนมัติ</p>}
      </>}</div>}
    </>}
    <fieldset><legend>คืนชุดยังไง</legend><div className="booking-return-options">{returnMethods.map(item => <label key={item.key} className={`booking-method ${returnMethod === item.key ? "selected" : ""}`}><input type="radio" name="return" value={item.key} checked={returnMethod === item.key} onChange={() => setReturnMethod(item.key)} /><span><strong>{item.label}</strong><small>ร้านเว้น Gap {settings.schedule.gap[item.key]} วันก่อนรับคิวถัดไป</small></span></label>)}</div></fieldset>
    {plan && <RentalTimeline plan={plan} pickup={method === "pickup"} compact />}
    {tooSoon && plan && <p className="booking-error">วิธีนี้ร้านต้องส่งล่วงหน้า {plan.lead} วัน (ต้องส่ง {shortDate(plan.ship)} ซึ่งผ่านไปแล้ว) กรุณาเลือกวิธีรับชุดอื่น หรือเลื่อนวันเริ่มใช้งาน</p>}
  </>;

  const confirm = <>
    {remembered && <p className="booking-remembered">กรอกข้อมูลจากครั้งก่อนให้แล้ว <button type="button" onClick={() => { forgetContact(); setRemembered(false); setName(""); setPhone(""); }}>ล้างข้อมูล</button></p>}
    <label>ชื่อ *<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อผู้ติดต่อ" /></label>
    <label>เบอร์โทร *<input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxx" /></label><p className="booking-help">มือถือไทย 10 หลัก · อยู่ต่างประเทศใส่ + และรหัสประเทศ</p>
    {canSkipDeposit && <fieldset><legend>เงินมัดจำ</legend><div className="booking-deposit-options">
      <label className={`booking-method ${mode === "deposit" ? "selected" : ""}`}><input type="radio" name="deposit" checked={mode === "deposit"} onChange={() => setDepositMode("deposit")} /><span><strong>วางเงินมัดจำ</strong><small>ร้านแจ้งยอดในบิล ได้คืนหลังคืนชุด</small></span></label>
      <label className={`booking-method ${mode === "identity" ? "selected" : ""}`}><input type="radio" name="deposit" checked={mode === "identity"} onChange={() => setDepositMode("identity")} /><span><strong>ไม่วางเงินมัดจำ · ยืนยันตัวตนแทน</strong><small>{settings.verification.note}</small></span></label>
    </div>{mode === "identity" && <p className="booking-help">หลังส่งคำขอ ร้านจะส่งลิงก์ให้ยืนยันตัวตนทาง LINE ต้องส่งเอกสารก่อนวันจัดส่ง ข้อมูลใช้เพื่อการเช่านี้เท่านั้น และลบอัตโนมัติหลังจบการเช่า {settings.verification.deleteAfterDays} วัน</p>}</fieldset>}
    <label>โน้ตถึงร้าน (ไม่บังคับ)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="เช่น งานรับปริญญา / สอบถามเพิ่มเติม…" /></label>
    <dl className="booking-summary">{[["วันใช้งาน", `${shortDate(start)} – ${shortDate(end)} · ${days} วัน`, 0], ["รับชุด", `${methodLabel}${plan ? ` · ร้าน${method === "pickup" ? "เตรียมไว้" : "ส่ง"} ${shortDate(plan.ship)}` : ""}`, 1], ["คืนชุด", `${returnMethods.find(item => item.key === returnMethod)?.label}${plan ? ` · ภายใน ${shortDate(plan.returnDate)}` : ""}`, 1], ...(method !== "pickup" ? [["ที่อยู่", address, 1]] : [])].map(([label, value, at]) => <div key={label as string}><dt>{label}</dt><dd>{value}</dd><button type="button" onClick={() => goTo(at as number)}>แก้ไข</button></div>)}</dl>
    <details className="booking-rules"><summary>กติกาของร้าน และการใช้ข้อมูลติดต่อ</summary><RentalRules rules={settings.rentalRules} /><p>ร้านบันทึกชื่อ เบอร์โทร ที่อยู่จัดส่ง (ถ้ามี) และรายละเอียดคำขอ เพื่อประสานงานการเช่าและติดต่อกลับเท่านั้น</p></details>
    <label className="booking-acknowledgment"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />อ่านและยอมรับกฎการเช่า และยินยอมให้ร้านบันทึกข้อมูลติดต่อเพื่อจัดการคำขอนี้ *</label>
    <p className="booking-notice">ร้านจะตรวจสอบคิวและติดต่อยืนยันราคาก่อน คำขอนี้ยังไม่ใช่การจองที่ยืนยันแล้ว</p>
  </>;

  return <Dialog.Root onOpenChange={open => { if (open) opened(); }}>{trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : <Dialog.Trigger className="pill pill-pink mt-4 w-full" disabled={items.length === 0}>ขอจองชุด</Dialog.Trigger>}<Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-panel booking-panel"><Dialog.Title className="text-xl font-semibold">{requestId ? "ส่งคำขอแล้ว" : "ขอจองชุด"}</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-6 text-slate-500">{requestId ? "ทำตามขั้นตอนด้านล่างเพื่อยืนยันการจอง" : "ร้านต้องยืนยันชุดว่างและราคาก่อนการจอง"}</Dialog.Description><Dialog.Close className="dialog-close" aria-label="ปิดฟอร์มจอง"><Icon name="close" /></Dialog.Close>
    {requestId ? success : <form className="booking-form" noValidate onSubmit={event => { event.preventDefault(); next(); }}>
      <ol className="booking-steps" aria-label="ขั้นตอนการจอง">{steps.map((label, at) => <li key={label} className={at === step ? "is-current" : at < step ? "is-done" : ""}><button type="button" onClick={() => goTo(at)} aria-current={at === step ? "step" : undefined}><b>{at < step ? "✓" : at + 1}</b>{label}</button></li>)}</ol>
      {step === 0 ? dates : step === 1 ? receive : confirm}
      {error && <p className="booking-error" role="alert">{error}</p>}
      <div className="booking-footer">
        <div className="booking-total">{rentalTotal === null ? <><strong>รอร้านแจ้งราคา</strong><small>{delivery > 0 ? `ค่าส่ง ${baht(delivery)}` : shipping?.discount ? "ส่งฟรี" : "ยังไม่รวมเงินมัดจำ"}</small></> : <><strong>{baht(rentalTotal + delivery)}</strong><small>{days > 0 ? `ค่าเช่า ${days} วัน ${baht(rentalTotal)}` : `เริ่มต้น ${baht(rentalTotal)}`}{delivery > 0 ? ` + ค่าส่ง ${baht(delivery)}` : method !== "pickup" && shipping?.discount ? " · ส่งฟรี" : ""} · ยังไม่รวมเงินมัดจำ</small></>}</div>
        <div className="booking-footer-actions">{step > 0 && <button type="button" className="pill pill-outline" disabled={submitting} onClick={() => { setError(""); setStep(step - 1); }}>ย้อนกลับ</button>}<button type="submit" className="pill pill-pink" disabled={items.length === 0 || submitting}>{step < 2 ? "ถัดไป" : submitting ? "กำลังส่ง…" : "ส่งคำขอจอง"}</button></div>
      </div>
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
