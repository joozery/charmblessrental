"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { needsTracking, returnCarriers } from "@/lib/rental-stage";

type Reported = { carrier: string; trackingNumber: string } | null;
export default function ReturnForm({ token, reported }: { token: string; reported: Reported }) {
  const router = useRouter();
  const [open, setOpen] = useState(!reported);
  const [carrier, setCarrier] = useState(reported?.carrier || returnCarriers[0]);
  const [trackingNumber, setTrackingNumber] = useState(reported?.trackingNumber || "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const tracking = needsTracking(carrier);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bill/${token}/return`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ carrier, trackingNumber: tracking ? trackingNumber : "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="bill-link-button" onClick={() => setOpen(true)}>แก้ไขข้อมูลการส่งคืน</button>;
  return <form className="bill-return-form" onSubmit={submit}>
    <label>ส่งคืนทาง<select value={carrier} onChange={event => setCarrier(event.target.value)}>{returnCarriers.map(item => <option key={item}>{item}</option>)}</select></label>
    {tracking && <label>เลขพัสดุ<input required maxLength={60} value={trackingNumber} onChange={event => setTrackingNumber(event.target.value.toUpperCase())} placeholder="เช่น TH0123456789" /></label>}
    {error && <p className="bill-error" role="alert">{error}</p>}
    <div><button type="submit" className="bill-button is-primary" disabled={busy || (tracking && !trackingNumber.trim())}>{busy ? "กำลังบันทึก…" : reported ? "บันทึกการแก้ไข" : "แจ้งส่งคืนสินค้า"}</button>{reported && <button type="button" className="bill-button" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</button>}</div>
  </form>;
}
