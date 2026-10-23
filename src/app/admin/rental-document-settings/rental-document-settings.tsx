"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover } from "radix-ui";
import type { RentalDocumentDefaults } from "@/lib/store-settings";
import { accountForDay, bankByCode, bankByName, banks, overlappingAccounts, type ShopAccount } from "@/lib/banks";
import BankBadge from "@/components/bank-badge";
import jsQR from "jsqr";
import { thaiQrName, validThaiQr } from "@/lib/thai-qr";

// The text inside a QR image (tried at full size, then smaller for big phone photos), or "" when none is found.
async function readQr(image: Blob) {
  const bitmap = await createImageBitmap(image);
  for (const size of [1600, 1000, 600]) {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (found?.data) return found.data;
  }
  return "";
}

type TextField = "returnAddress" | "returnPhone" | "returnMethod";
const days = Array.from({ length: 31 }, (_, index) => index + 1);
const newId = () => Math.random().toString(36).slice(2, 10);

function BankPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const bank = bankByCode(value);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" className="bank-picker-trigger"><BankBadge code={value} /><span>{bank?.name || "เลือกธนาคาร"}</span><Icon name="chevronDown" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="bank-picker-menu" align="start" sideOffset={6} collisionPadding={12}>
      {banks.map(item => <button key={item.code} type="button" className={item.code === value ? "is-selected" : ""} onClick={() => { onChange(item.code); setOpen(false); }}><BankBadge code={item.code} size={24} /><span>{item.name}</span>{item.code === value && <Icon name="check" />}</button>)}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export default function RentalDocumentSettings({ initial, today }: { initial: RentalDocumentDefaults; today: number }) {
  // Before several accounts existed the shop had one; it becomes the first account, used every day.
  const [settings, setSettings] = useState<RentalDocumentDefaults>(() => ({ ...initial, accounts: initial.accounts?.length ? initial.accounts : initial.accountNumber ? [{ id: newId(), bankCode: bankByName(initial.bank)?.code || "kbank", accountName: initial.accountName, accountNumber: initial.accountNumber, qrImage: initial.qrImage, fromDay: 1, toDay: 31 }] : [] }));
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const accounts = settings.accounts;
  const setAccount = (id: string, patch: Partial<ShopAccount>) => setSettings(current => ({ ...current, accounts: current.accounts.map(account => account.id === id ? { ...account, ...patch } : account) }));
  // A new account takes the days after the last one; if the last already runs to month end, it gives up the second half.
  const addAccount = () => setSettings(current => {
    const last = current.accounts[current.accounts.length - 1];
    const split = last && last.toDay === 31 ? Math.max(last.fromDay, Math.floor((last.fromDay + 30) / 2)) : null;
    const kept = split !== null && split < 31 ? current.accounts.map(account => account.id === last!.id ? { ...account, toDay: split } : account) : current.accounts;
    const fromDay = !last ? 1 : split !== null && split < 31 ? split + 1 : Math.min(31, last.toDay + 1);
    return { ...current, accounts: [...kept, { id: newId(), bankCode: "kbank", accountName: last?.accountName || "", accountNumber: "", qrImage: "", fromDay, toDay: 31 }] };
  });
  const overlaps = overlappingAccounts(accounts);
  const active = accountForDay(accounts, today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const uploading = uploadingFor !== null;
  function field(key: TextField, label: string, placeholder: string, wide = false) {
    return <label key={key} className={`rental-settings-field${wide ? " rental-settings-wide" : ""}`}><span>{label}</span><input value={settings[key]} placeholder={placeholder} onChange={event => setSettings(current => ({ ...current, [key]: event.target.value }))} /></label>;
  }

  // QRs uploaded before amounts were supported: read the text from the saved image.
  async function readSavedQr(account: ShopAccount) {
    setUploadingFor(account.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/store-settings/qr-image?url=${encodeURIComponent(account.qrImage)}`);
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "โหลดรูป QR ไม่สำเร็จ");
      const text = await readQr(await response.blob());
      if (!validThaiQr(text)) throw new Error("อ่านข้อมูลใน QR ไม่ได้ ลองอัปโหลดรูป QR ที่ชัดกว่านี้");
      setAccount(account.id, { qrPayload: text });
      setNotice("อ่าน QR แล้ว กดบันทึกเพื่อให้บิลสร้าง QR ตามยอด");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "อ่าน QR ไม่สำเร็จ"); }
    finally { setUploadingFor(null); }
  }

  async function uploadQr(id: string, file?: File) {
    if (!file) return;
    setUploadingFor(id); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("image", file);
      const response = await fetch("/api/admin/store-settings/images", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "อัปโหลด QR ไม่สำเร็จ");
      const text = await readQr(file).catch(() => "");
      setAccount(id, { qrImage: data.url, qrPayload: validThaiQr(text) ? text : "" });
      setNotice(validThaiQr(text) ? "อัปโหลด QR แล้ว บิลจะสร้าง QR ตามยอดให้อัตโนมัติ กดบันทึกเพื่อใช้งาน" : "อัปโหลด QR แล้ว แต่อ่านข้อมูลใน QR ไม่ได้ บิลจะใช้รูปนี้ตามเดิม (ลูกค้าต้องกรอกยอดเอง) กดบันทึกเพื่อใช้งาน");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "อัปโหลด QR ไม่สำเร็จ"); }
    finally { setUploadingFor(null); }
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
          <div className="rental-settings-card-heading"><span className="rental-settings-step">01</span><div><h2 id="payment-settings-title">บัญชีรับโอน</h2><p>บัญชีที่เลือกใช้ใน &quot;ใบสรุปก่อนชำระเงิน&quot; (หน้าคำขอจอง) โดยไม่ต้องพิมพ์ใหม่ เพิ่มได้หลายบัญชีและกำหนดวันที่ของเดือนที่ใช้แต่ละบัญชี ส่วนยอดค่าเช่า ค่าส่ง และเงินมัดจำ มาจากคำขอของลูกค้าและสินค้าแต่ละชิ้น</p></div></div>
          <div className="bank-schedule" aria-label="บัญชีที่ใช้แต่ละวันของเดือน">{days.map(day => { const account = accountForDay(accounts, day), covered = accounts.some(item => item.fromDay <= day && day <= item.toDay); return <span key={day} className={`${day === today ? "is-today" : ""}${covered ? "" : " is-fallback"}`} style={{ background: account ? bankByCode(account.bankCode)?.color : undefined }} title={`วันที่ ${day}: ${account ? `${bankByCode(account.bankCode)?.name} ${account.accountNumber}` : "ยังไม่มีบัญชี"}${covered ? "" : " (ไม่มีช่วงวันที่ครอบคลุม ใช้บัญชีแรก)"}`}>{day}</span>; })}</div>
          <p className="bank-schedule-note">แถบสีคือบัญชีที่ใช้แต่ละวันของเดือน วันนี้ (วันที่ {today}) ใช้ {active ? <b>{bankByCode(active.bankCode)?.name} {active.accountNumber}</b> : "—"} · ใบสรุปจะใช้บัญชีของวันที่ทำใบสรุป</p>
          {overlaps.length > 0 && <p className="admin-error" role="alert">ช่วงวันที่ทับกัน: {overlaps.map(([a, b]) => `${bankByCode(a.bankCode)?.name} (${a.fromDay}–${a.toDay}) กับ ${bankByCode(b.bankCode)?.name} (${b.fromDay}–${b.toDay})`).join(", ")}</p>}
          <div className="bank-accounts">{accounts.map((account, index) => <article key={account.id} className="bank-account" style={{ borderColor: bankByCode(account.bankCode)?.color }}>
            <header><span className="bank-account-index">บัญชีที่ {index + 1}</span>{active?.id === account.id && <span className="bank-account-today">ใช้วันนี้</span>}<button type="button" className="bank-account-remove" onClick={() => setSettings(current => ({ ...current, accounts: current.accounts.filter(item => item.id !== account.id) }))}>ลบบัญชี</button></header>
            <div className="rental-settings-fields">
              <div className="rental-settings-field"><span>ธนาคาร</span><BankPicker value={account.bankCode} onChange={bankCode => setAccount(account.id, { bankCode })} /></div>
              <div className="rental-settings-field"><span>ใช้วันที่ของเดือน</span><div className="bank-days"><select aria-label="ตั้งแต่วันที่" value={account.fromDay} onChange={event => setAccount(account.id, { fromDay: Number(event.target.value), toDay: Math.max(Number(event.target.value), account.toDay) })}>{days.map(day => <option key={day} value={day}>{day}</option>)}</select><span>ถึง</span><select aria-label="ถึงวันที่" value={account.toDay} onChange={event => setAccount(account.id, { toDay: Number(event.target.value) })}>{days.filter(day => day >= account.fromDay).map(day => <option key={day} value={day}>{day === 31 ? "สิ้นเดือน" : day}</option>)}</select></div></div>
              <label className="rental-settings-field"><span>ชื่อบัญชี</span><input value={account.accountName} placeholder="ชื่อเจ้าของบัญชี" onChange={event => setAccount(account.id, { accountName: event.target.value })} /></label>
              <label className="rental-settings-field"><span>{account.bankCode === "promptpay" ? "เบอร์หรือเลขพร้อมเพย์" : "เลขที่บัญชี"}</span><input value={account.accountNumber} inputMode="numeric" placeholder="xxx-x-xxxxx-x" onChange={event => setAccount(account.id, { accountNumber: event.target.value })} /></label>
              <div className="rental-settings-field rental-settings-wide"><span>QR ชำระเงินของบัญชีนี้</span><div className="bank-account-qr">{account.qrImage ? <Image src={account.qrImage} alt="" width={64} height={64} unoptimized /> : <span>QR</span>}<label className="rental-settings-upload">{uploadingFor === account.id ? "กำลังอัปโหลด…" : account.qrImage ? "เปลี่ยนรูป QR" : "อัปโหลดรูป QR"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { void uploadQr(account.id, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>{account.qrImage && <button type="button" className="rental-settings-clear" onClick={() => setAccount(account.id, { qrImage: "", qrPayload: "" })}>นำรูป QR ออก</button>}</div>
                {account.qrImage && (account.qrPayload ? <small className="bank-account-qr-state is-ready">✓ บิลสร้าง QR ตามยอดให้อัตโนมัติ{thaiQrName(account.qrPayload) ? ` · ${thaiQrName(account.qrPayload)}` : ""}</small> : <small className="bank-account-qr-state">QR นี้ยังไม่ใส่ยอดอัตโนมัติ <button type="button" className="rental-settings-clear" disabled={uploading} onClick={() => void readSavedQr(account)}>อ่านข้อมูล QR</button></small>)}</div>
            </div>
          </article>)}</div>
          <button type="button" className="bank-account-add" onClick={addAccount}><Icon name="plus" />เพิ่มบัญชีธนาคาร</button>
        </section>

        <section className="rental-settings-card" aria-labelledby="return-settings-title">
          <div className="rental-settings-card-heading"><span className="rental-settings-step">03</span><div><h2 id="return-settings-title">ส่งคืนสินค้า</h2><p>ข้อมูลปลายทางที่ลูกค้าจะเห็นหลังเช่าเสร็จ</p></div></div>
          <div className="rental-settings-fields">{field("returnAddress", "ที่อยู่สำหรับส่งคืน", "ชื่อผู้รับ บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์", true)}{field("returnPhone", "เบอร์ติดต่อสำหรับพัสดุ", "เบอร์โทรร้าน")}{field("returnMethod", "วิธีส่งคืน", "เช่น ไปรษณีย์ / Flash / KEX")}</div>
        </section>

        <div className="rental-settings-footer"><Link href="/admin/bookings">กลับไปคำขอจอง</Link><Button type="submit" disabled={busy || uploading || overlaps.length > 0}><Icon name="check" />{busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</Button></div>
      </div>

      <aside className="rental-settings-preview" aria-label="ตัวอย่างข้อมูลบนใบรายละเอียดการเช่า"><div className="rental-settings-preview-heading"><span>LIVE PREVIEW</span><strong>ตัวอย่างบนใบรายละเอียด</strong><p>ตัวอย่างนี้เปลี่ยนตามข้อมูลที่กำลังกรอก</p></div><div className="rental-settings-paper"><div className="rental-settings-paper-head"><strong>CHARM BLESS <em>Rental</em></strong><span>ใบรายละเอียดการเช่า</span></div><div className="rental-settings-paper-block"><h3>สรุปยอดค่าเช่า</h3><p><span>ค่าเช่า / ค่าจัดส่ง</span><span>อิงจากคำขอจอง</span></p><p><span>เงินมัดจำ</span><span>ตามสินค้าแต่ละชิ้น</span></p></div><div className="rental-settings-paper-block"><h3>ช่องทางชำระเงิน</h3><div className="rental-settings-paper-payment"><div className="rental-settings-paper-qr">{active?.qrImage ? <Image src={active.qrImage} alt="" width={66} height={66} unoptimized /> : <span>QR</span>}</div><p><strong className="bank-preview-name">{active && <BankBadge code={active.bankCode} size={18} />}{active ? bankByCode(active.bankCode)?.name : "ชื่อธนาคาร"}</strong><span>{active?.accountNumber || "เลขบัญชี"}</span><span>{active?.accountName || "ชื่อบัญชี"}</span></p></div></div><div className="rental-settings-paper-block"><h3>ข้อมูลสำหรับส่งคืน</h3><p className="rental-settings-paper-return">{settings.returnAddress || "ที่อยู่ส่งคืน"}<br />{settings.returnPhone || "เบอร์ติดต่อ"}<br />{settings.returnMethod || "วิธีส่งคืน"}</p></div></div><p className="rental-settings-preview-note">กดบันทึกก่อนกลับไปทำใบสรุป ข้อมูลใหม่จะถูกใช้กับคำขอจองที่เปิดหลังจากนั้น</p></aside>
    </form>
  </main>;
}
