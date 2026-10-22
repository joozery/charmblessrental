"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { RentalDocumentDefaults } from "@/lib/store-settings";

type TextField = "bank" | "accountName" | "accountNumber" | "returnAddress" | "returnPhone" | "returnMethod";

export default function RentalDocumentSettings({ initial }: { initial: RentalDocumentDefaults }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const money = (value: number) => value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function field(key: TextField, label: string, placeholder: string, wide = false) {
    return <label key={key} className={`rental-settings-field${wide ? " rental-settings-wide" : ""}`}><span>{label}</span><input value={settings[key]} placeholder={placeholder} onChange={event => setSettings(current => ({ ...current, [key]: event.target.value }))} /></label>;
  }

  async function uploadQr(file?: File) {
    if (!file) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("image", file);
      const response = await fetch("/api/admin/store-settings/images", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "อัปโหลด QR ไม่สำเร็จ");
      setSettings(current => ({ ...current, qrImage: data.url }));
      setNotice("อัปโหลด QR แล้ว กดบันทึกเพื่อใช้กับใบรายละเอียดการเช่า");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "อัปโหลด QR ไม่สำเร็จ"); }
    finally { setUploading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/rental-document-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setSettings(data.settings); setNotice("บันทึกค่าเริ่มต้นใบรายละเอียดการเช่าแล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return <main className="admin-main rental-document-settings-page">
    <header className="rental-settings-header">
      <div><span className="rental-settings-eyebrow">DOCUMENT SETTINGS <span> / ใบรายละเอียดการเช่า</span></span><h1>ตั้งค่าใบรายละเอียดการเช่า</h1><p>เตรียมข้อมูลที่ร้านใช้ซ้ำไว้ครั้งเดียว ทุกใบสรุปจะเติมให้อัตโนมัติ และแก้เฉพาะรายการได้ก่อนส่งให้ลูกค้า</p></div>
    </header>
    {notice && <p className="admin-success" role="status">{notice}</p>}{error && <p className="admin-error" role="alert">{error}</p>}
    <form id="rental-document-settings-form" className="rental-settings-layout" onSubmit={save}>
      <div className="rental-settings-main">
        <section className="rental-settings-card" aria-labelledby="payment-settings-title">
          <div className="rental-settings-card-heading"><span className="rental-settings-step">01</span><div><h2 id="payment-settings-title">รับชำระเงิน</h2><p>บัญชีธนาคารและยอดมัดจำที่แสดงบนใบรายละเอียด</p></div></div>
          <div className="rental-settings-fields">
            <label className="rental-settings-field"><span>เงินมัดจำเริ่มต้น <small>บาท</small></span><input type="number" min="0" max="1000000" step="0.01" value={settings.deposit} onChange={event => setSettings(current => ({ ...current, deposit: Number(event.target.value) }))} /><small>ปรับยอดเฉพาะลูกค้าได้ตอนทำใบสรุป</small></label>
            {field("bank", "ธนาคาร", "เช่น กสิกรไทย")}
            {field("accountName", "ชื่อบัญชี", "ชื่อเจ้าของบัญชี")}
            {field("accountNumber", "เลขที่บัญชี", "เลขบัญชีสำหรับรับโอน")}
          </div>
        </section>

        <section className="rental-settings-card" aria-labelledby="qr-settings-title">
          <div className="rental-settings-card-heading"><span className="rental-settings-step">02</span><div><h2 id="qr-settings-title">QR ชำระเงิน</h2><p>เพิ่มรูป QR เพื่อให้ลูกค้าสแกนจากใบรายละเอียดได้ทันที</p></div></div>
          <div className="rental-settings-qr-layout">
            <div className="rental-settings-qr-tile">{settings.qrImage ? <Image src={settings.qrImage} alt="ตัวอย่าง QR ชำระเงิน" width={140} height={140} unoptimized /> : <span>QR<br />PAYMENT</span>}</div>
            <div className="rental-settings-qr-controls"><label className="rental-settings-upload">{uploading ? "กำลังอัปโหลด…" : "เลือกรูป QR จากเครื่อง"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { void uploadQr(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><small>PNG, JPG หรือ WebP · ไม่เกิน 5 MB</small><label className="rental-settings-field"><span>หรือวางลิงก์รูป QR</span><input type="url" value={settings.qrImage} placeholder="https://…" onChange={event => setSettings(current => ({ ...current, qrImage: event.target.value }))} /></label>{settings.qrImage && <button type="button" className="rental-settings-clear" onClick={() => setSettings(current => ({ ...current, qrImage: "" }))}>นำรูป QR ออก</button>}</div>
          </div>
        </section>

        <section className="rental-settings-card" aria-labelledby="return-settings-title">
          <div className="rental-settings-card-heading"><span className="rental-settings-step">03</span><div><h2 id="return-settings-title">ส่งคืนสินค้า</h2><p>ข้อมูลปลายทางที่ลูกค้าจะเห็นหลังเช่าเสร็จ</p></div></div>
          <div className="rental-settings-fields">{field("returnAddress", "ที่อยู่สำหรับส่งคืน", "ชื่อผู้รับ บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์", true)}{field("returnPhone", "เบอร์ติดต่อสำหรับพัสดุ", "เบอร์โทรร้าน")}{field("returnMethod", "วิธีส่งคืน", "เช่น ไปรษณีย์ / Flash / KEX")}</div>
        </section>

        <div className="rental-settings-footer"><Link href="/admin/bookings">กลับไปคำขอจอง</Link><Button type="submit" disabled={busy || uploading}><Icon name="check" />{busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</Button></div>
      </div>

      <aside className="rental-settings-preview" aria-label="ตัวอย่างข้อมูลบนใบรายละเอียดการเช่า"><div className="rental-settings-preview-heading"><span>LIVE PREVIEW</span><strong>ตัวอย่างบนใบรายละเอียด</strong><p>ตัวอย่างนี้เปลี่ยนตามข้อมูลที่กำลังกรอก</p></div><div className="rental-settings-paper"><div className="rental-settings-paper-head"><strong>CHARM BLESS <em>Rental</em></strong><span>ใบรายละเอียดการเช่า</span></div><div className="rental-settings-paper-block"><h3>สรุปยอดค่าเช่า</h3><p><span>ค่าเช่า / ค่าจัดส่ง</span><span>อิงจากคำขอจอง</span></p><p><span>เงินมัดจำ</span><strong>{money(settings.deposit)} บาท</strong></p></div><div className="rental-settings-paper-block"><h3>ช่องทางชำระเงิน</h3><div className="rental-settings-paper-payment"><div className="rental-settings-paper-qr">{settings.qrImage ? <Image src={settings.qrImage} alt="" width={66} height={66} unoptimized /> : <span>QR</span>}</div><p><strong>{settings.bank || "ชื่อธนาคาร"}</strong><span>{settings.accountNumber || "เลขบัญชี"}</span><span>{settings.accountName || "ชื่อบัญชี"}</span></p></div></div><div className="rental-settings-paper-block"><h3>ข้อมูลสำหรับส่งคืน</h3><p className="rental-settings-paper-return">{settings.returnAddress || "ที่อยู่ส่งคืน"}<br />{settings.returnPhone || "เบอร์ติดต่อ"}<br />{settings.returnMethod || "วิธีส่งคืน"}</p></div></div><p className="rental-settings-preview-note">กดบันทึกก่อนกลับไปทำใบสรุป ข้อมูลใหม่จะถูกใช้กับคำขอจองที่เปิดหลังจากนั้น</p></aside>
    </form>
  </main>;
}
