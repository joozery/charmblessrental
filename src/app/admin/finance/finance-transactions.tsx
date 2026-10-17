"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";

type Transaction = { _id: string; type: "income" | "expense"; category: string; amount: number; date: string; note: string; createdBy?: string };
const categories = { income: ["ค่าเช่า", "ค่าจัดส่ง", "เงินประกัน", "ค่าปรับ", "อื่น ๆ"], expense: ["ซื้อสินค้า", "ค่าซ่อมแซม", "ค่าแพ็กของ", "ค่าโฆษณา", "ค่าเดินทาง", "ค่าสาธารณูปโภค", "คืนเงินประกัน", "อื่น ๆ"] };
const money = (value: number) => `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

export default function FinanceTransactions({ initial, today }: { initial: Transaction[]; today: string }) {
  const [transactions, setTransactions] = useState(initial);
  const [type, setType] = useState<"income" | "expense">("income");
  const [category, setCategory] = useState(categories.income[0]);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totals = useMemo(() => transactions.reduce((sum, row) => { sum[row.type] += row.amount; return sum; }, { income: 0, expense: 0 }), [transactions]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, category, date, amount: Number(amount), note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกรายการไม่สำเร็จ");
      setTransactions(rows => [data.transaction, ...rows]); setAmount(""); setNote("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกรายการไม่สำเร็จ กรุณาลองอีกครั้ง"); }
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
      <label className="finance-entry-note">หมายเหตุ<input value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" /></label>
      <button type="submit" disabled={saving}><Icon name="plus" />{saving ? "กำลังบันทึก…" : "เพิ่มรายการ"}</button>
    </form>
    {error && <p className="finance-error" role="alert">{error}</p>}
    <div className="finance-ledger-list-head"><h3>รายการในช่วงวันที่นี้</h3><span>{transactions.length.toLocaleString("th-TH")} รายการ</span></div>
    {transactions.length ? <div className="finance-ledger-table-wrap"><table className="finance-ledger-table"><thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวดหมู่</th><th>หมายเหตุ</th><th>จำนวนเงิน</th></tr></thead><tbody>{transactions.map(row => <tr key={row._id}><td>{dateLabel(row.date)}</td><td><span className={`finance-ledger-badge ${row.type === "income" ? "is-income" : "is-expense"}`}>{row.type === "income" ? "รายรับ" : "รายจ่าย"}</span></td><td>{row.category}</td><td>{row.note || "—"}</td><td className={`is-${row.type}`}>{row.type === "income" ? "+" : "−"}{money(row.amount)}</td></tr>)}</tbody></table></div> : <p className="finance-empty">ยังไม่มีรายการรายรับหรือรายจ่ายในช่วงนี้</p>}
    <p className="finance-panel-note">บันทึกแยกจากข้อมูลประวัติการเช่าเดิม เพื่อป้องกันยอดซ้ำ รายรับจากรายการเช่าเดิมยังดูได้จากสรุปด้านบน</p>
  </section>;
}
