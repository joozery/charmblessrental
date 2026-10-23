"use client";

import { useState } from "react";
import type { Extension } from "@/lib/extension";

type Row = { _id: string; extensions?: Extension[]; quote?: { discountPercent?: number; discountCode?: string } };

export default function ExtensionAmountPanel({ row, canEdit, onChange }: { row: Row; canEdit: boolean; onChange: (extensions: Extension[]) => void }) {
  const unpaid = (row.extensions || []).filter(item => item.status === "unpaid");
  const [editing, setEditing] = useState<{ id: string; amount: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!unpaid.length || !canEdit) return null;
  async function save() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/bookings/extension", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row._id, action: "updateAmount", extensionId: editing.id, amount: Number(editing.amount) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "แก้ยอดบิลไม่สำเร็จ");
      onChange((row.extensions || []).map(item => item.id === data.extension.id ? data.extension : item)); setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "แก้ยอดบิลไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return <div className="bookings-detail-section bookings-extension-amount"><span className="bookings-modify-icon">฿</span><div><h3>ตั้งยอดบิลส่วนต่าง</h3><p>แก้ยอดบิลที่ 2 ได้ก่อนลูกค้าชำระเงิน โดยไม่เปลี่ยนยอดบิลหลัก</p>{row.quote?.discountPercent ? <p className="bookings-extension-discount">ส่วนลดที่ใช้กับบิลนี้: {row.quote.discountPercent}%{row.quote.discountCode ? ` · โค้ด ${row.quote.discountCode}` : ""}</p> : null}{unpaid.map(item => editing?.id === item.id ? <div className="bookings-inline-form" key={item.id}><label>ยอดบิลที่ 2 (บาท)<input type="number" min="0.01" step="0.01" value={editing.amount} onChange={event => setEditing({ ...editing, amount: event.target.value })} /></label><div><button type="button" disabled={busy} onClick={() => setEditing(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || Number(editing.amount) <= 0} onClick={() => void save()}>บันทึกยอด</button></div></div> : <div className="bookings-extension-amount-row" key={item.id}><span>บิลส่วนต่าง · {item.amount.toLocaleString("th-TH")} บาท</span><button type="button" onClick={() => setEditing({ id: item.id, amount: String(item.amount) })}>แก้ยอด</button></div>)}{error && <p className="admin-error" role="alert">{error}</p>}</div></div>;
}
