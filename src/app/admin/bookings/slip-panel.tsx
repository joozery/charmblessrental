"use client";

import { useEffect, useState } from "react";
import { money } from "@/components/rental-document";
import { slipStatusLabels, type SlipStatus } from "@/lib/payment-slips";

type Slip = { _id: string; status: SlipStatus; reason: string; due: number; createdAt: string; transRef?: string; amount?: number; dateTime?: string; senderName?: string; receiverName?: string; reviewedByName?: string };
export type SlipPatch = { payment?: "paid"; paidAt?: string; slipReview?: undefined; deposit?: { amount: number; status: "held"; receivedAt: string; receivedByName: string } };
const when = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));

// Slips the customer attached on the bill: what Slip2Go read, and the shop's call on the ones it could not pass.
export default function SlipPanel({ bookingId, deposit, onChange }: { bookingId: string; deposit: number; onChange: (patch: SlipPatch) => void }) {
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/slips?bookingId=${encodeURIComponent(bookingId)}`).then(response => response.ok ? response.json() : { slips: [] }).then(data => { if (live) setSlips(data.slips || []); }).catch(() => { if (live) setSlips([]); });
    return () => { live = false; };
  }, [bookingId]);

  async function decide(id: string, decision: "accept" | "reject", reason = "") {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/admin/slips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision, reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setSlips(current => (current || []).map(slip => slip._id === id ? { ...slip, status: data.status, ...(decision === "reject" ? { reason } : {}), reviewedByName: "คุณ" } : slip));
      setRejecting(null);
      onChange(decision === "accept" && data.paidAt ? { payment: "paid", paidAt: data.paidAt, slipReview: undefined, ...(deposit > 0 ? { deposit: { amount: deposit, status: "held", receivedAt: data.paidAt, receivedByName: "คุณ" } } : {}) } : { slipReview: undefined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(""); }
  }

  if (!slips?.length) return null;
  return <div className="bookings-detail-section bookings-slips"><div>
    <h3>สลิปที่ลูกค้าแนบ</h3>
    {error && <p className="bookings-slip-error" role="alert">{error}</p>}
    <ul>{slips.map(slip => <li key={slip._id} className={`is-${slip.status}`}>
      <a href={`/api/admin/slips/${slip._id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/admin/slips/${slip._id}`} alt="สลิปโอนเงิน" /></a>
      <div>
        <strong>{slipStatusLabels[slip.status]}</strong>
        <small>แนบเมื่อ {when(slip.createdAt)}{slip.reviewedByName ? ` · ตรวจโดย ${slip.reviewedByName}` : ""}</small>
        {slip.amount !== undefined && <p>ยอดในสลิป <b>{money(slip.amount)}</b> / ยอดบิล {money(slip.due)} บาท{slip.dateTime ? ` · โอน ${when(slip.dateTime)}` : ""}</p>}
        {(slip.senderName || slip.receiverName) && <p>{slip.senderName || "?"} → {slip.receiverName || "?"}</p>}
        {slip.transRef && <p>อ้างอิง {slip.transRef}</p>}
        {slip.reason && <p className="bookings-slip-reason">{slip.status === "rejected" ? "เหตุผล: " : "ตรวจอัตโนมัติไม่ผ่าน: "}{slip.reason}</p>}
        {slip.status === "review" && (rejecting?.id === slip._id
          ? <div className="bookings-slip-actions"><input autoFocus maxLength={300} placeholder="เหตุผลที่แจ้งลูกค้า เช่น ยอดไม่ครบ" value={rejecting.reason} onChange={event => setRejecting({ id: slip._id, reason: event.target.value })} /><button type="button" disabled={busy === slip._id || !rejecting.reason.trim()} onClick={() => decide(slip._id, "reject", rejecting.reason.trim())}>ยืนยันว่าไม่ถูกต้อง</button><button type="button" onClick={() => setRejecting(null)}>ยกเลิก</button></div>
          : <div className="bookings-slip-actions"><button type="button" className="is-primary" disabled={busy === slip._id} onClick={() => decide(slip._id, "accept")}>สลิปถูกต้อง ยืนยันชำระ</button><button type="button" disabled={busy === slip._id} onClick={() => setRejecting({ id: slip._id, reason: "" })}>สลิปไม่ถูกต้อง</button></div>)}
      </div>
    </li>)}</ul>
  </div></div>;
}
