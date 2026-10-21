"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { money } from "@/components/rental-document";
import type { Permission } from "@/lib/permissions";
import { fieldLabels, showValue } from "@/lib/audit-labels";

export type Shipment = { carrier: string; trackingNumber: string; shippedAt: string; byName: string };
export type Returned = { at: string; condition: string; note: string; byName: string };
export type Deposit = { amount: number; status: "held" | "refunded" | "partial" | "forfeited" | "void"; receivedAt: string; receivedByName: string; refund?: { amount: number; deducted: number; reason: string; date: string; evidence: string[]; at: string; byName: string } };
export type FulfillmentRow = { _id: string; method: string; status: string; payment?: "unpaid" | "paid"; shipment?: Shipment; returned?: Returned; deposit?: Deposit };
type Log = { _id: string; at: string; action: string; summary: string; actorName: string; actorEmail: string; changes: { field: string; before: unknown; after: unknown }[] };

const conditions = [{ key: "good", label: "สภาพปกติ" }, { key: "damaged", label: "ชำรุด / มีคราบ" }, { key: "missing", label: "สูญหาย / ไม่ครบ" }];
export const depositStatus: Record<Deposit["status"], string> = { held: "ถือไว้ รอคืน", refunded: "คืนเต็มจำนวน", partial: "คืนบางส่วน", forfeited: "ยึดทั้งหมด", void: "ยกเลิก" };
const stamp = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function send(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

export default function BookingFulfillment({ row, permissions, onChange }: { row: FulfillmentRow; permissions: Permission[]; onChange: (patch: Partial<FulfillmentRow>) => void }) {
  const canShip = permissions.includes("shipping"), canRefund = permissions.includes("deposits");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [shipForm, setShipForm] = useState<{ carrier: string; trackingNumber: string } | null>(null);
  const [returnForm, setReturnForm] = useState<{ condition: string; note: string } | null>(null);
  const [refundForm, setRefundForm] = useState<{ refund: string; date: string; reason: string; evidence: string[] } | null>(null);
  const [logs, setLogs] = useState<Log[] | null>(null);
  const pickup = row.method === "pickup";

  async function run(task: () => Promise<void>) { setBusy(true); setError(""); try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); } }
  const refreshLogs = async () => { if (logs) setLogs((await (await fetch(`/api/admin/activity?targetId=${encodeURIComponent(row._id)}`, { cache: "no-store" })).json()).logs || []); };
  const ship = () => run(async () => { const data = await send("/api/admin/bookings", { id: row._id, action: "ship", carrier: shipForm?.carrier || "", trackingNumber: shipForm?.trackingNumber || "" }); onChange({ shipment: data.shipment }); setShipForm(null); await refreshLogs(); });
  const receive = () => run(async () => { const data = await send("/api/admin/bookings", { id: row._id, action: "receiveReturn", condition: returnForm?.condition, note: returnForm?.note || "" }); onChange({ returned: data.returned }); setReturnForm(null); await refreshLogs(); });
  const refund = () => run(async () => { if (!refundForm) return; const data = await send("/api/admin/deposits", { bookingId: row._id, refund: Number(refundForm.refund), date: refundForm.date, reason: refundForm.reason, evidence: refundForm.evidence }); onChange({ deposit: data.deposit }); setRefundForm(null); await refreshLogs(); });
  const upload = (files: FileList | null) => run(async () => {
    if (!files?.length || !refundForm) return;
    const urls: string[] = [];
    for (const file of Array.from(files).slice(0, 5 - refundForm.evidence.length)) {
      const form = new FormData(); form.append("image", file);
      const response = await fetch("/api/admin/deposits/evidence", { method: "POST", body: form }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "อัปโหลดหลักฐานไม่สำเร็จ");
      urls.push(data.url);
    }
    setRefundForm(current => current && { ...current, evidence: [...current.evidence, ...urls] });
  });
  const loadLogs = () => run(async () => { const response = await fetch(`/api/admin/activity?targetId=${encodeURIComponent(row._id)}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "โหลดประวัติไม่สำเร็จ"); setLogs(data.logs); });
  const deducted = refundForm && row.deposit ? Math.max(0, row.deposit.amount - (Number(refundForm.refund) || 0)) : 0;

  return <>
    {row.status !== "cancelled" && <div className="bookings-detail-section bookings-fulfillment"><Icon name="delivery" /><div>
      <h3>{pickup ? "ส่งมอบและรับคืน" : "จัดส่งและรับคืน"}</h3>
      {row.shipment && !shipForm ? <p className="bookings-fulfillment-done"><Icon name="success" />{pickup ? "ส่งมอบที่ร้านแล้ว" : `${row.shipment.carrier} ${row.shipment.trackingNumber}`.trim()}<small>{stamp(row.shipment.shippedAt)} · {row.shipment.byName}</small>{canShip && !row.returned && <button type="button" onClick={() => setShipForm({ carrier: row.shipment!.carrier, trackingNumber: row.shipment!.trackingNumber })}>แก้ไข</button>}</p>
        : !row.shipment && !shipForm ? <p className="bookings-fulfillment-wait">{pickup ? "ยังไม่ได้ส่งมอบสินค้า" : "ยังไม่ได้บันทึกเลขพัสดุ"}{canShip && <button type="button" disabled={busy} onClick={() => pickup ? setShipForm({ carrier: "", trackingNumber: "" }) : setShipForm({ carrier: "ไปรษณีย์ไทย", trackingNumber: "" })}>{pickup ? "บันทึกส่งมอบ" : "บันทึกเลขพัสดุ"}</button>}</p> : null}
      {shipForm && <div className="bookings-inline-form">{!pickup && <><label>ขนส่ง<input value={shipForm.carrier} maxLength={60} onChange={event => setShipForm({ ...shipForm, carrier: event.target.value })} placeholder="ไปรษณีย์ไทย / Flash / Kerry" /></label><label>เลขพัสดุ<input value={shipForm.trackingNumber} maxLength={60} onChange={event => setShipForm({ ...shipForm, trackingNumber: event.target.value.toUpperCase() })} placeholder="EX123456789TH" /></label></>}<div><button type="button" disabled={busy} onClick={() => setShipForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || (!pickup && !shipForm.trackingNumber.trim())} onClick={ship}>{busy ? "กำลังบันทึก…" : pickup ? "ยืนยันส่งมอบแล้ว" : "บันทึกเลขพัสดุ"}</button></div></div>}
      {row.shipment && (row.returned ? <p className="bookings-fulfillment-done"><Icon name="success" />รับคืนแล้ว · {conditions.find(item => item.key === row.returned!.condition)?.label}<small>{stamp(row.returned.at)} · {row.returned.byName}{row.returned.note ? ` · ${row.returned.note}` : ""}</small></p>
        : !returnForm ? <p className="bookings-fulfillment-wait">ยังไม่ได้รับคืนสินค้า{canShip && <button type="button" disabled={busy} onClick={() => setReturnForm({ condition: "good", note: "" })}>บันทึกรับคืน</button>}</p>
        : <div className="bookings-inline-form"><label>สภาพสินค้า<select value={returnForm.condition} onChange={event => setReturnForm({ ...returnForm, condition: event.target.value })}>{conditions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>หมายเหตุ<input value={returnForm.note} maxLength={500} onChange={event => setReturnForm({ ...returnForm, note: event.target.value })} placeholder="เช่น มีคราบที่ชายกระโปรง" /></label><div><button type="button" disabled={busy} onClick={() => setReturnForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy} onClick={receive}>{busy ? "กำลังบันทึก…" : "ยืนยันรับคืน"}</button></div></div>)}
    </div></div>}
    {row.deposit && row.deposit.status !== "void" && <div className="bookings-detail-section bookings-deposit"><Icon name="shield" /><div>
      <h3>เงินประกัน</h3>
      <p className="bookings-deposit-head"><strong>{money(row.deposit.amount)} บาท</strong><span className={`bookings-deposit-badge is-${row.deposit.status}`}>{depositStatus[row.deposit.status]}</span></p>
      <p className="bookings-deposit-meta">รับเมื่อ {day(row.deposit.receivedAt)} · {row.deposit.receivedByName}</p>
      {row.deposit.refund && <div className="bookings-deposit-refund"><p>คืน <b>{money(row.deposit.refund.amount)}</b> บาท{row.deposit.refund.deducted > 0 && <> · หัก <b>{money(row.deposit.refund.deducted)}</b> บาท</>} · {day(row.deposit.refund.date)}</p>{row.deposit.refund.reason && <p>เหตุผล: {row.deposit.refund.reason}</p>}<p className="bookings-deposit-meta">บันทึกโดย {row.deposit.refund.byName} · {stamp(row.deposit.refund.at)}</p>{!!row.deposit.refund.evidence.length && <div className="bookings-evidence">{row.deposit.refund.evidence.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">หลักฐาน {index + 1}</a>)}</div>}</div>}
      {row.deposit.status === "held" && canRefund && (!row.returned ? <p className="bookings-fulfillment-wait">คืนเงินประกันได้หลังบันทึกรับคืนสินค้า</p>
        : !refundForm ? <p className="bookings-fulfillment-wait">รอคืนเงินประกัน<button type="button" disabled={busy} onClick={() => setRefundForm({ refund: String(row.deposit!.amount), date: today(), reason: "", evidence: [] })}>บันทึกคืนเงินประกัน</button></p>
        : <div className="bookings-inline-form"><label>ยอดคืน (บาท)<input type="number" min="0" max={row.deposit.amount} step="0.01" value={refundForm.refund} onChange={event => setRefundForm({ ...refundForm, refund: event.target.value })} /></label><label>วันที่คืน<input type="date" value={refundForm.date} max={today()} onChange={event => setRefundForm({ ...refundForm, date: event.target.value })} /></label>
          {deducted > 0 && <label className="is-wide">เหตุผลที่หัก {money(deducted)} บาท<input value={refundForm.reason} maxLength={500} required onChange={event => setRefundForm({ ...refundForm, reason: event.target.value })} placeholder="เช่น ค่าซักคราบ / ส่งคืนล่าช้า 1 วัน" /></label>}
          <label className="is-wide">หลักฐานการโอนคืน{Number(refundForm.refund) > 0 ? " (จำเป็น)" : ""}<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || refundForm.evidence.length >= 5} onChange={event => { void upload(event.target.files); event.target.value = ""; }} /></label>
          {!!refundForm.evidence.length && <div className="bookings-evidence is-wide">{refundForm.evidence.map((url, index) => <span key={url}><a href={url} target="_blank" rel="noopener noreferrer">หลักฐาน {index + 1}</a><button type="button" aria-label={`ลบหลักฐาน ${index + 1}`} onClick={() => setRefundForm({ ...refundForm, evidence: refundForm.evidence.filter(item => item !== url) })}>×</button></span>)}</div>}
          <div><button type="button" disabled={busy} onClick={() => setRefundForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || (deducted > 0 && !refundForm.reason.trim()) || (Number(refundForm.refund) > 0 && !refundForm.evidence.length)} onClick={refund}>{busy ? "กำลังบันทึก…" : "ยืนยันคืนเงินประกัน"}</button></div></div>)}
    </div></div>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="bookings-detail-section bookings-timeline"><Icon name="history" /><div>
      <h3>ประวัติการทำรายการ</h3>
      {!logs ? <button type="button" className="bookings-timeline-load" disabled={busy} onClick={loadLogs}>ดูว่าใครทำอะไรกับคำขอนี้</button>
        : logs.length ? <ol>{logs.map(log => <li key={log._id}><strong>{log.summary}</strong><small>{stamp(log.at)} · {log.actorName || log.actorEmail}</small>{!!log.changes.length && log.action !== "booking.payment_confirmed" && <ul>{log.changes.map(change => <li key={change.field}><span>{fieldLabels[change.field] || change.field}</span>{showValue(change.before)} → <b>{showValue(change.after)}</b></li>)}</ul>}</li>)}</ol>
        : <p className="bookings-fulfillment-wait">ยังไม่มีประวัติที่บันทึกไว้</p>}
    </div></div>
  </>;
}
