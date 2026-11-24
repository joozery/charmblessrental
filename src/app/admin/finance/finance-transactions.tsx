"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Dialog } from "radix-ui";

type Transaction = { _id: string; type: "income" | "expense"; category: string; amount: number; date: string; note: string; createdBy?: string; createdByName?: string; bookingId?: string; attachments?: string[]; source?: "manual" | "booking" | "deposit" | "extension" | "late" | "adjustment"; voided?: { reason: string; byName: string; at: string } };
const categories = { income: ["ค่าเช่า", "ค่าจัดส่ง", "ค่าปรับ", "อื่น ๆ"], expense: ["ซื้อสินค้า", "ค่าซ่อมแซม", "ค่าแพ็กของ", "ค่าโฆษณา", "ค่าเดินทาง", "ค่าสาธารณูปโภค", "อื่น ๆ"] };
const sourceLabel = { manual: "บันทึกเอง", booking: "จากการยืนยันชำระ", deposit: "หักจากเงินมัดจำ", extension: "จากค่าเช่าต่อ", late: "จากค่าปรับคืนช้า", adjustment: "จากการแก้ไขการจอง" };
const money = (value: number) => `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

async function prepareEvidenceImage(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error("ไม่สามารถอ่านรูปนี้ได้")); value.src = source; });
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("ไม่สามารถเตรียมรูปได้");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .86));
    if (!blob) throw new Error("ไม่สามารถแปลงรูปเป็น WebP ได้");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "evidence"}.webp`, { type: "image/webp" });
  } finally { URL.revokeObjectURL(source); }
}

export default function FinanceTransactions({ initial, today, totals: initialTotals, total, page, pageCount, from, to }: { initial: Transaction[]; today: string; totals: { income: number; expense: number }; total: number; page: number; pageCount: number; from: string; to: string }) {
  const [transactions, setTransactions] = useState(initial);
  const [totals, setTotals] = useState(initialTotals);
  const [type, setType] = useState<"income" | "expense">("income");
  const [category, setCategory] = useState(categories.income[0]);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const prepared = await Promise.all(images.map(prepareEvidenceImage));
      const payload = new FormData(); payload.set("type", type); payload.set("category", category); payload.set("date", date); payload.set("amount", amount); payload.set("note", note); if (bookingId.trim()) payload.set("bookingId", bookingId.trim()); prepared.forEach(file => payload.append("image", file));
      const response = await fetch("/api/admin/finance", { method: "POST", body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกรายการไม่สำเร็จ");
      const transaction = data.transaction as Transaction;
      setTransactions(rows => [transaction, ...rows]); setTotals(current => ({ ...current, [transaction.type]: current[transaction.type] + transaction.amount })); setAmount(""); setNote(""); setBookingId(""); setImages([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกรายการไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    finally { setSaving(false); }
  }
  async function voidRow() {
    if (!voiding?.reason.trim()) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "void", id: voiding.id, reason: voiding.reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ยกเลิกรายการไม่สำเร็จ");
      setTransactions(rows => rows.map(row => row._id === voiding.id ? { ...row, voided: data.voided } : row)); setVoiding(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ยกเลิกรายการไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  return <section className="finance-panel finance-ledger" aria-labelledby="finance-ledger-title">
    <div className="finance-panel-head"><div><span className="finance-eyebrow">CASH FLOW LEDGER</span><h2 id="finance-ledger-title">บันทึกรายรับ–รายจ่าย</h2></div><span className="finance-panel-caption">ช่วงที่เลือก</span></div>
    <div className="finance-ledger-totals"><article><span>รายรับที่บันทึก</span><strong className="is-income">{money(totals.income)}</strong></article><article><span>รายจ่ายที่บันทึก</span><strong className="is-expense">{money(totals.expense)}</strong></article><article><span>สุทธิ</span><strong>{money(totals.income - totals.expense)}</strong></article></div>
    <form className="finance-entry-form" onSubmit={submit}>
      <label>ประเภทรายการ<select value={type} onChange={event => { const next = event.target.value as "income" | "expense"; setType(next); setCategory(categories[next][0]); }}><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></label>
      <label>หมวดหมู่<select value={category} onChange={event => setCategory(event.target.value)}>{categories[type].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>วันที่<input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
      <label>จำนวนเงิน (บาท)<input type="number" min="0.01" max="1000000000" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" required /></label>
      <label>เลขที่คำขอ (ถ้ามี)<input value={bookingId} onChange={event => setBookingId(event.target.value)} maxLength={100} placeholder="BR-…" /></label>
      <label className="finance-entry-note">หมายเหตุ<input value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" /></label>
      <label className="finance-entry-images">รูปหลักฐาน<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={saving || images.length >= 3} onChange={event => { const selected = Array.from(event.target.files || []).slice(0, 3 - images.length); setImages(current => [...current, ...selected]); event.currentTarget.value = ""; }} /><small>{images.length ? `เลือกแล้ว ${images.length}/3 รูป · ระบบแปลงเป็น WebP อัตโนมัติ` : "สูงสุด 3 รูป · ไม่เกิน 5 MB/รูป"}</small></label>
      <button type="submit" disabled={saving}><Icon name="plus" />{saving ? "กำลังบันทึก…" : "เพิ่มรายการ"}</button>
    </form>
    {error && <p className="finance-error" role="alert">{error}</p>}
    <div className="finance-ledger-list-head"><h3>รายการในช่วงวันที่นี้</h3><span>{total.toLocaleString("th-TH")} รายการ · หน้า {page}/{pageCount}</span></div>
    {transactions.length ? <div className="finance-ledger-table-wrap"><table className="finance-ledger-table"><thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวดหมู่</th><th>หมายเหตุ</th><th>จำนวนเงิน</th><th><span className="admin-sr-only">จัดการ</span></th></tr></thead><tbody>{transactions.map(row => <tr key={row._id} className={row.voided ? "is-void" : undefined}><td>{dateLabel(row.date)}</td><td><span className={`finance-ledger-badge ${row.type === "income" ? "is-income" : "is-expense"}`}>{row.type === "income" ? "รายรับ" : "รายจ่าย"}</span></td><td>{row.category}</td><td>{row.note || "—"}{row.bookingId && <> · <Link href={`/admin/bookings?id=${encodeURIComponent(row.bookingId)}`}>{row.bookingId}</Link></>}<span className="finance-ledger-meta">{sourceLabel[row.source || "manual"]} · {row.createdByName || row.createdBy || "—"}{row.voided && ` · ยกเลิกโดย ${row.voided.byName}: ${row.voided.reason}`}</span>{row.attachments?.length ? <div className="finance-evidence-thumbs">{row.attachments.map((url, index) => <button type="button" key={url} onClick={() => setPreview(url)} aria-label={`ดูรูปหลักฐานที่ ${index + 1}`}><img src={url} alt={`หลักฐานที่ ${index + 1}`} /></button>)}</div> : null}</td><td className={`is-${row.type}`}>{row.type === "income" ? "+" : "−"}{money(row.amount)}</td><td className="finance-ledger-actions">{!row.voided && (row.source || "manual") === "manual" && (voiding?.id === row._id ? <span className="finance-void-form"><input autoFocus value={voiding.reason} maxLength={300} placeholder="เหตุผลที่ยกเลิก" onChange={event => setVoiding({ id: row._id, reason: event.target.value })} /><button type="button" disabled={saving || !voiding.reason.trim()} onClick={voidRow}>ยืนยัน</button><button type="button" disabled={saving} onClick={() => setVoiding(null)}>ปิด</button></span> : <button type="button" onClick={() => setVoiding({ id: row._id, reason: "" })}>ยกเลิกรายการ</button>)}</td></tr>)}</tbody></table></div> : <p className="finance-empty">ยังไม่มีรายการรายรับหรือรายจ่ายในช่วงนี้</p>}
    {pageCount > 1 && <nav className="finance-pagination" aria-label="เปลี่ยนหน้ารายการธุรกรรม">{page > 1 && <Link href={`/admin/finance?from=${from}&to=${to}&page=${page - 1}`}>ก่อนหน้า</Link>}<span>หน้า {page} / {pageCount}</span>{page < pageCount && <Link href={`/admin/finance?from=${from}&to=${to}&page=${page + 1}`}>ถัดไป</Link>}</nav>}
    <p className="finance-panel-note">รายรับค่าเช่าและค่าส่งของคำขอจองจะลงให้อัตโนมัติเมื่อยืนยันชำระ เงินมัดจำไม่อยู่ในบัญชีนี้ รายการที่ยกเลิกยังแสดงไว้แต่ไม่นับยอด และไม่สามารถลบได้</p>
    <Dialog.Root open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog finance-evidence-dialog"><Dialog.Title>รูปหลักฐาน</Dialog.Title><Dialog.Description>แสดงภายในหน้านี้</Dialog.Description>{preview && <img src={preview} alt="รูปหลักฐานรายการการเงิน" /> }<Dialog.Close className="admin-dialog-close" aria-label="ปิดรูปหลักฐาน"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
