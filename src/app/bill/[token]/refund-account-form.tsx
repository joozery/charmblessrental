"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cleanRefundAccount, emptyRefundAccount, refundAccountError, refundBanks, type RefundAccount } from "@/lib/refund-account";

export default function RefundAccountForm({ token, saved }: { token: string; saved: RefundAccount | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(!saved);
  const [form, setForm] = useState(saved || emptyRefundAccount);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!cleanRefundAccount(form)) { setError(refundAccountError); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/bill/${token}/refund-account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }

  if (!open && saved) return <><p className="bill-refund-saved">{saved.bank} · {saved.accountNumber}<br />{saved.accountName}</p><button type="button" className="bill-link-button" onClick={() => setOpen(true)}>แก้ไขบัญชี</button></>;
  return <form className="bill-refund-form" onSubmit={submit}>
    <label>ธนาคาร<select required value={form.bank} onChange={event => setForm({ ...form, bank: event.target.value })}><option value="">เลือกธนาคาร</option>{refundBanks.map(bank => <option key={bank}>{bank}</option>)}</select></label>
    <label>ชื่อบัญชี<input required maxLength={120} value={form.accountName} onChange={event => setForm({ ...form, accountName: event.target.value })} placeholder="ชื่อ-นามสกุลเจ้าของบัญชี" /></label>
    <label>เลขบัญชี / พร้อมเพย์<input required inputMode="numeric" maxLength={20} value={form.accountNumber} onChange={event => setForm({ ...form, accountNumber: event.target.value })} placeholder="xxx-x-xxxxx-x" /></label>
    {error && <p className="bill-error" role="alert">{error}</p>}
    <div><button type="submit" className="bill-button is-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกบัญชี"}</button>{saved && <button type="button" className="bill-button" disabled={busy} onClick={() => { setForm(saved); setOpen(false); }}>ยกเลิก</button>}</div>
  </form>;
}
