"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { mapsLink, messengerFee, type MessengerSettings } from "@/lib/delivery";

type Form = { enabled: boolean; inBill: boolean; originLink: string; originLabel: string; baseFee: string; includedKm: string; perKm: string; maxKm: string; description: string };
const toForm = (value: MessengerSettings): Form => ({ enabled: value.enabled, inBill: value.inBill, originLink: value.origin ? `${value.origin.lat}, ${value.origin.lng}` : "", originLabel: value.originLabel, baseFee: String(value.baseFee), includedKm: String(value.includedKm), perKm: String(value.perKm), maxKm: value.maxKm == null ? "" : String(value.maxKm), description: value.description });
async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/delivery-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

export default function DeliverySettings({ initial, emsFee, mapsReady }: { initial: MessengerSettings; emsFee: number; mapsReady: boolean }) {
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
    <header className="rental-pricing-header"><span className="rental-pricing-eyebrow">DELIVERY</span><h1>ค่าจัดส่งแมสเซนเจอร์</h1><p>คิดค่าส่ง Grab / LINE MAN จากระยะทางถนนจริงระหว่างร้านกับที่อยู่หรือหมุดที่ลูกค้าส่งมา ค่าส่ง EMS ({emsFee.toLocaleString("th-TH")} บาท) ตั้งได้ที่หน้าตั้งค่าหน้าร้าน</p></header>
    {!mapsReady && <p className="admin-error" role="alert">ยังไม่ได้ตั้งค่า GOOGLE_MAPS_API_KEY บนเซิร์ฟเวอร์ ระบบจึงยังคำนวณระยะทางไม่ได้ (ลูกค้าจะเห็นว่าร้านจะแจ้งค่าส่งภายหลัง)</p>}
    <div className="rental-pricing-layout">
      <form className="rental-pricing-card delivery-form" onSubmit={save}>
        <h2>ตั้งค่าการคิดราคา</h2>
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
