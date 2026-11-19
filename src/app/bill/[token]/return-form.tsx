"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { needsTracking, returnCarriers } from "@/lib/rental-stage";

type Reported = { carrier: string; trackingNumber: string } | null;
type ReturnPhoto = { url: string };

export default function ReturnForm({ token, reported, existingPhotos = [], existingReceiptPhotos = [] }: { token: string; reported: Reported; existingPhotos?: ReturnPhoto[]; existingReceiptPhotos?: ReturnPhoto[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(!reported);
  const [carrier, setCarrier] = useState(reported?.carrier || returnCarriers[0]);
  const [trackingNumber, setTrackingNumber] = useState(reported?.trackingNumber || "");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [returnFiles, setReturnFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tracking = needsTracking(carrier);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiptFiles.length && !existingReceiptPhotos.length) { setError("กรุณาแนบรูปใบเสร็จหรือหลักฐานส่งคืนพัสดุ"); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("carrier", carrier); form.set("trackingNumber", tracking ? trackingNumber : "");
      receiptFiles.forEach(file => form.append("receipt", file));
      returnFiles.forEach(file => form.append("image", file));
      const response = await fetch(`/api/bill/${token}/return`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  const receiptSection = <section className="bill-return-photos"><strong>รูปใบเสร็จ/หลักฐานส่งคืนพัสดุ</strong>{existingReceiptPhotos.length > 0 && <div>{existingReceiptPhotos.map((photo, index) => <img key={`${photo.url}-${index}`} src={photo.url} alt={`หลักฐานส่งคืน ${index + 1}`} />)}</div>}</section>;
  const returnSection = existingPhotos.length > 0 ? <section className="bill-return-photos"><strong>รูปตอนส่งคืนสินค้า</strong><div>{existingPhotos.map((photo, index) => <img key={`${photo.url}-${index}`} src={photo.url} alt={`รูปตอนส่งคืน ${index + 1}`} />)}</div></section> : null;
  if (!open) return <>{receiptSection}{returnSection}<button type="button" className="bill-link-button" onClick={() => setOpen(true)}>อัปโหลดรูปเพิ่ม / แก้ไขข้อมูลการส่งคืน</button></>;

  return <>{receiptSection}{returnSection}<form className="bill-return-form" onSubmit={submit}>
    <label>ส่งคืนทาง<select value={carrier} onChange={event => setCarrier(event.target.value)}>{returnCarriers.map(item => <option key={item}>{item}</option>)}</select></label>
    {tracking && <label>เลขพัสดุ<input required maxLength={60} value={trackingNumber} onChange={event => setTrackingNumber(event.target.value.toUpperCase())} placeholder="เช่น TH0123456789" /></label>}
    <label className="bill-return-upload">อัปโหลดรูปใบเสร็จ/หลักฐานส่งคืนพัสดุ (บังคับ)<input type="file" accept="image/png,image/jpeg,image/webp" multiple required={!existingReceiptPhotos.length} disabled={busy} onChange={event => setReceiptFiles(Array.from(event.target.files || []).slice(0, 5))} /><small>แนบอย่างน้อย 1 รูป รูปละไม่เกิน 5 MB</small></label>
    <label className="bill-return-upload">อัปโหลดรูปตอนส่งคืนสินค้า (ไม่บังคับ)<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={event => setReturnFiles(Array.from(event.target.files || []).slice(0, 5))} /><small>แนบได้ไม่เกิน 5 รูป รูปละไม่เกิน 5 MB</small></label>
    {error && <p className="bill-error" role="alert">{error}</p>}
    <div><button type="submit" className="bill-button is-primary" disabled={busy || tracking && !trackingNumber.trim() || !receiptFiles.length && !existingReceiptPhotos.length}>{busy ? "กำลังบันทึก…" : reported ? "บันทึกการแก้ไข" : "แจ้งส่งคืนสินค้า"}</button>{reported && <button type="button" className="bill-button" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</button>}</div>
  </form></>;
}
