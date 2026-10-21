"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { mapsLink, messengerFee, type MessengerSettings } from "@/lib/delivery";
import type { FreeShipping, ShippingOption } from "@/lib/shipping";
import { planRental, returnMethods, type ReturnMethod, type ScheduleSettings } from "@/lib/schedule";

type Form = { enabled: boolean; inBill: boolean; originLink: string; originLabel: string; baseFee: string; includedKm: string; perKm: string; maxKm: string; description: string };
const toForm = (value: MessengerSettings): Form => ({ enabled: value.enabled, inBill: value.inBill, originLink: value.origin ? `${value.origin.lat}, ${value.origin.lng}` : "", originLabel: value.originLabel, baseFee: String(value.baseFee), includedKm: String(value.includedKm), perKm: String(value.perKm), maxKm: value.maxKm == null ? "" : String(value.maxKm), description: value.description });
async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/delivery-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

type OptionRow = Omit<ShippingOption, "fee"> & { fee: string };
const slug = (label: string, taken: string[]) => { const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "carrier"; let id = base, n = 2; while (taken.includes(id)) id = `${base}-${n++}`; return id; };

function ShippingSettings({ initial }: { initial: { options: ShippingOption[]; free: FreeShipping; schedule: ScheduleSettings } }) {
  const [rows, setRows] = useState<OptionRow[]>(initial.options.map(option => ({ ...option, fee: String(option.fee) })));
  const [free, setFree] = useState({ enabled: initial.free.enabled, minItems: String(initial.free.minItems) });
  const [schedule, setSchedule] = useState(initial.schedule);
  const dayInput = (value: number, change: (value: number) => void, label: string) => <label>{label}<input type="number" min="0" max="14" step="1" value={value} onChange={event => change(Math.max(0, Math.min(14, Math.round(Number(event.target.value) || 0))))} /></label>;
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const set = (index: number, patch: Partial<OptionRow>) => setRows(current => current.map((row, at) => at === index ? { ...row, ...patch } : row));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const options = rows.map(row => ({ ...row, id: row.id || slug(row.label, rows.map(item => item.id)), fee: Number(row.fee) }));
      if (options.some(option => !option.label.trim() || !Number.isFinite(option.fee) || option.fee < 0)) throw new Error("กรอกชื่อและราคาขนส่งให้ครบ");
      await post({ action: "shipping", options, free: { enabled: free.enabled, minItems: Number(free.minItems) }, schedule });
      setRows(options.map(option => ({ ...option, fee: String(option.fee) })));
      setNotice("บันทึกแล้ว ฟอร์มจองจะแสดงราคาขนส่งใหม่ภายในไม่กี่นาที");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  const standard = rows.filter(row => row.enabled && row.standard).map(row => Number(row.fee)).filter(Number.isFinite);
  return <form className="rental-pricing-card delivery-form" onSubmit={save}>
    <h2>ขนส่งพัสดุ</h2>
    <p>ราคาต่อคำขอ ลูกค้าเลือกได้ในฟอร์มจอง · สินค้าชิ้นใหญ่ตั้ง &ldquo;ค่าส่งเฉพาะสินค้า&rdquo; ได้ที่หน้าจัดการสินค้า (เช่น The North Face 80)</p>
    <div className="shipping-rows">{rows.map((row, index) => <div className="shipping-row" key={index}>
      <label>ชื่อขนส่ง<input value={row.label} maxLength={80} onChange={event => set(index, { label: event.target.value })} placeholder="เช่น Flash / Kerry" /></label>
      <label>ราคา (บาท)<input type="number" min="0" step="1" value={row.fee} onChange={event => set(index, { fee: event.target.value })} /></label>
      {dayInput(row.leadDays, leadDays => set(index, { leadDays }), "ส่งล่วงหน้า (วัน)")}
      <label className="is-wide">คำอธิบาย<input value={row.description} maxLength={200} onChange={event => set(index, { description: event.target.value })} placeholder="เช่น ถึงใน 1–2 วัน" /></label>
      <label className="delivery-check"><input type="checkbox" checked={row.enabled} onChange={event => set(index, { enabled: event.target.checked })} />เปิดให้เลือก</label>
      <label className="delivery-check"><input type="checkbox" checked={row.standard} onChange={event => set(index, { standard: event.target.checked })} />แบบมาตรฐาน (ส่งฟรีเมื่อเข้าโปร)</label>
      {rows.length > 1 && <button type="button" className="shipping-remove" onClick={() => setRows(rows.filter((_, at) => at !== index))}>ลบ</button>}
    </div>)}</div>
    {rows.length < 10 && <Button type="button" variant="outline" onClick={() => setRows([...rows, { id: "", label: "", fee: "", description: "", enabled: true, standard: false, leadDays: 3 }])}>+ เพิ่มขนส่ง</Button>}
    <h2>ระยะเวลาจัดส่งและ Gap</h2>
    <p>ใช้กันคิวและแสดงในปฏิทินหน้าสินค้า: ร้านส่งล่วงหน้าก่อนวันเริ่มใช้งาน · ลูกค้าส่งคืนวันถัดจากวันใช้งานวันสุดท้าย · เว้น Gap ไว้รับของ ตรวจ และซัก ก่อนรับคิวใหม่</p>
    <div className="delivery-grid">{dayInput(schedule.pickupLead, pickupLead => setSchedule({ ...schedule, pickupLead }), "รับที่ร้าน: เตรียมล่วงหน้า (วัน)")}{dayInput(schedule.messengerLead, messengerLead => setSchedule({ ...schedule, messengerLead }), "แมส: ส่งล่วงหน้า (วัน)")}{returnMethods.map(item => <span key={item.key}>{dayInput(schedule.gap[item.key], value => setSchedule({ ...schedule, gap: { ...schedule.gap, [item.key]: value } as Record<ReturnMethod, number> }), `Gap เมื่อ${item.label} (วัน)`)}</span>)}</div>
    <p className="delivery-help">ตัวอย่าง: ใช้งาน 19–28 พ.ย. ส่ง Flash ({rows.find(row => row.standard)?.leadDays ?? 3} วัน) คืนพัสดุ → {(() => { const plan = planRental("2026-11-19", "2026-11-28", rows.find(row => row.standard)?.leadDays ?? 3, schedule.gap.parcel); const d = (day: string) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`; return `ส่ง ${d(plan.ship)} · คืน ${d(plan.returnDate)} · รับคิวใหม่ได้ ${d(plan.ready)}`; })()}</p>
    <h2>โปรส่งฟรี</h2>
    <label className="delivery-check"><input type="checkbox" checked={free.enabled} onChange={event => setFree({ ...free, enabled: event.target.checked })} />เปิดโปรส่งฟรี</label>
    <label>เมื่อเช่าครบ (ตัว)<input type="number" min="1" max="20" step="1" value={free.minItems} onChange={event => setFree({ ...free, minItems: event.target.value })} /></label>
    <p className="delivery-help">ส่งฟรีเฉพาะขนส่งที่ติ๊ก &ldquo;แบบมาตรฐาน&rdquo;{standard.length ? ` · ถ้าเลือกขนส่งอื่นหรือแมส ลดให้ ${Math.min(...standard)} บาท แล้วจ่ายส่วนต่าง` : " · ยังไม่มีขนส่งแบบมาตรฐานที่เปิดอยู่"}</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกขนส่ง"}</Button></div>
  </form>;
}

export default function DeliverySettings({ initial, shipping, mapsReady }: { initial: MessengerSettings; shipping: { options: ShippingOption[]; free: FreeShipping; schedule: ScheduleSettings }; mapsReady: boolean }) {
  const [form, setForm] = useState(toForm(initial));
  const [origin, setOrigin] = useState(initial.origin);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [test, setTest] = useState(""); const [testResult, setTestResult] = useState("");
  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }));
  const numbers = { baseFee: Number(form.baseFee), includedKm: Number(form.includedKm), perKm: Number(form.perKm), maxKm: form.maxKm.trim() ? Number(form.maxKm) : null };
  const preview = { ...initial, ...numbers, maxKm: numbers.maxKm };
  const valid = [numbers.baseFee, numbers.includedKm, numbers.perKm].every(value => Number.isFinite(value) && value >= 0) && (numbers.maxKm === null || numbers.maxKm > 0);

  async function locate() {
    setError(""); setBusy(true);
    try { const { point } = await post({ action: "resolve", link: form.originLink }); setOrigin(point); set({ originLink: `${point.lat}, ${point.lng}` }); }
    catch (cause) { setOrigin(null); setError(cause instanceof Error ? cause.message : "อ่านพิกัดไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (!valid) { setError("ตรวจสอบตัวเลขอีกครั้ง"); return; }
    setBusy(true);
    try {
      await post({ settings: { enabled: form.enabled, inBill: form.inBill, origin, originLabel: form.originLabel, ...numbers, description: form.description } });
      setNotice(form.enabled ? "บันทึกแล้ว ฟอร์มจองจะคำนวณค่าส่งแมสให้ลูกค้าอัตโนมัติ" : "บันทึกแล้ว (ยังปิดคำนวณอัตโนมัติ ลูกค้าจะเห็น “ตามระยะทาง”)");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function runTest() {
    setTestResult(""); setBusy(true);
    try { const data = await post({ action: "test", address: test }); setTestResult(`ระยะทาง ${data.km} กม. → ค่าส่ง ${data.fee.toLocaleString("th-TH")} บาท${data.address ? ` (${data.address})` : ""}`); }
    catch (cause) { setTestResult(cause instanceof Error ? cause.message : "ทดสอบไม่สำเร็จ"); } finally { setBusy(false); }
  }

  return <main className="admin-main rental-pricing-page">
    <header className="rental-pricing-header"><span className="rental-pricing-eyebrow">DELIVERY</span><h1>ค่าจัดส่ง</h1><p>ขนส่งพัสดุ โปรส่งฟรี และค่าส่งแมสเซนเจอร์ (Grab / LINE MAN) ตามระยะทางถนนจริงจากร้าน</p></header>
    <div className="rental-pricing-layout delivery-shipping"><ShippingSettings initial={shipping} /></div>
    {!mapsReady && <p className="admin-error" role="alert">ยังไม่ได้ตั้งค่า GOOGLE_MAPS_API_KEY บนเซิร์ฟเวอร์ ระบบจึงยังคำนวณระยะทางไม่ได้ (ลูกค้าจะเห็นว่าร้านจะแจ้งค่าส่งภายหลัง)</p>}
    <div className="rental-pricing-layout">
      <form className="rental-pricing-card delivery-form" onSubmit={save}>
        <h2>แมสเซนเจอร์ตามระยะทาง</h2>
        <label className="delivery-check"><input type="checkbox" checked={form.enabled} onChange={event => set({ enabled: event.target.checked })} />เปิดคำนวณค่าส่งแมสอัตโนมัติในฟอร์มจอง</label>
        <label>ตำแหน่งร้าน (ลิงก์ Google Maps หรือพิกัด)<span className="delivery-inline"><input value={form.originLink} onChange={event => { set({ originLink: event.target.value }); setOrigin(null); }} placeholder="https://maps.app.goo.gl/… หรือ 13.7563, 100.5018" /><Button type="button" variant="outline" disabled={busy || !form.originLink.trim()} onClick={locate}>อ่านพิกัด</Button></span></label>
        <p className="delivery-help">{origin ? <>พิกัดร้าน {origin.lat}, {origin.lng} · <a href={mapsLink(origin)} target="_blank" rel="noopener noreferrer">ตรวจตำแหน่งบนแผนที่</a></> : "วางลิงก์หมุดร้านแล้วกด “อ่านพิกัด”"}</p>
        <label>ชื่อจุดรับส่ง (ไม่บังคับ)<input value={form.originLabel} maxLength={300} onChange={event => set({ originLabel: event.target.value })} placeholder="เช่น หน้าร้าน ซอยลาดพร้าว 101" /></label>
        <div className="delivery-grid">
          <label>ค่าเริ่มต้น (บาท)<input type="number" min="0" step="1" value={form.baseFee} onChange={event => set({ baseFee: event.target.value })} /></label>
          <label>รวมระยะแรก (กม.)<input type="number" min="0" step="0.5" value={form.includedKm} onChange={event => set({ includedKm: event.target.value })} /></label>
          <label>กม. ต่อไป กม.ละ (บาท)<input type="number" min="0" step="1" value={form.perKm} onChange={event => set({ perKm: event.target.value })} /></label>
          <label>ส่งไกลสุด (กม.)<input type="number" min="1" step="1" value={form.maxKm} placeholder="ไม่จำกัด" onChange={event => set({ maxKm: event.target.value })} /></label>
        </div>
        <label className="delivery-check"><input type="checkbox" checked={form.inBill} onChange={event => set({ inBill: event.target.checked })} />รวมค่าส่งไว้ในบิล (ไม่ติ๊ก = ลูกค้าจ่ายแมสปลายทาง แสดงเป็นค่าประมาณ)</label>
        <label>รายละเอียดที่แสดงในฟอร์มจอง<textarea rows={3} maxLength={500} value={form.description} onChange={event => set({ description: event.target.value })} /></label>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
        <div className="rental-pricing-actions"><Button type="submit" variant="primary" disabled={busy || !valid}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Button></div>
      </form>
      <aside className="rental-pricing-side">
        <section className="rental-pricing-card"><h2>ตัวอย่างค่าส่ง</h2><p>ระยะทางปัดขึ้นเป็นกิโลเมตรเต็ม</p><table><tbody>{[2, 5, 8, 10, 15, 20, 30].map(km => <tr key={km}><td>{km} กม.</td><td>{valid ? (preview.maxKm && km > preview.maxKm ? "ไม่รับส่ง" : `${messengerFee(preview, km).toLocaleString("th-TH")} บาท`) : "—"}</td></tr>)}</tbody></table></section>
        <section className="rental-pricing-card delivery-form"><h2>ทดสอบกับที่อยู่จริง</h2><p>ใช้ค่าที่บันทึกแล้ว</p><textarea rows={3} value={test} onChange={event => setTest(event.target.value)} placeholder="ที่อยู่ลูกค้า หรือวางลิงก์หมุด" /><Button type="button" variant="outline" disabled={busy || !test.trim()} onClick={runTest}>คำนวณ</Button>{testResult && <p className="delivery-help" role="status">{testResult}</p>}</section>
      </aside>
    </div>
  </main>;
}
