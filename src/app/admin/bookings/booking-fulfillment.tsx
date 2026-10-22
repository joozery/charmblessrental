"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { money } from "@/components/rental-document";
import type { Permission } from "@/lib/permissions";
import { fieldLabels, showValue } from "@/lib/audit-labels";
import { unitStatusLabels } from "@/lib/products";
import { rentalStage, stageLabel, stageSteps } from "@/lib/rental-stage";
import type { UnitChoice } from "@/lib/rental-units";
import { returnDay, returnMethods, type ScheduleRecord } from "@/lib/schedule";
import { verificationLabels, type BookingVerification } from "@/lib/identity";

export type Shipment = { carrier: string; trackingNumber: string; shippedAt: string; byName: string };
export type Returned = { at: string; condition: string; note: string; byName: string };
export type Deposit = { amount: number; status: "held" | "refunded" | "partial" | "forfeited" | "void"; receivedAt: string; receivedByName: string; refund?: { amount: number; deducted: number; reason: string; date: string; evidence: string[]; at: string; byName: string } };
export type CustomerReturn = { carrier: string; trackingNumber: string; at: string };
export type FulfillmentItem = { id: number; name: string; sku: string; unitSku?: string };
export type FulfillmentRow = { _id: string; method: string; status: string; start: string; end: string; schedule?: ScheduleRecord; items: FulfillmentItem[]; payment?: "unpaid" | "paid"; shipment?: Shipment; returned?: Returned; customerReturn?: CustomerReturn; returnReminderSentAt?: string; suggestedUnits?: string[]; verification?: BookingVerification; deposit?: Deposit };
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

type IdentityData = { profile: { fullName: string; address: string; backupPhone: string; social: string; consentAt: string } | null; files: { _id: string; kind: string }[] };
// Renting without a deposit: show what the customer sent (only to accounts with the "identity" permission) and approve it or ask again.
function IdentityReview({ row, canReview, onChange }: { row: FulfillmentRow; canReview: boolean; onChange: (verification: BookingVerification) => void }) {
  const verification = row.verification!;
  const [data, setData] = useState<IdentityData | null>(null);
  const [reason, setReason] = useState(""); const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function load() { setBusy(true); setError(""); try { const response = await fetch(`/api/admin/identity?bookingId=${encodeURIComponent(row._id)}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "โหลดเอกสารไม่สำเร็จ"); setData(result); } catch (cause) { setError(cause instanceof Error ? cause.message : "โหลดเอกสารไม่สำเร็จ"); } finally { setBusy(false); } }
  async function review(approve: boolean) { setBusy(true); setError(""); try { const result = await send("/api/admin/identity", { action: "review", bookingId: row._id, approve, reason }); onChange(result.verification); setAsking(false); setReason(""); setNotice(`${approve ? "ยืนยันตัวตนผ่านแล้ว" : "ขอเอกสารใหม่แล้ว"}${result.lineNotified ? " · แจ้งลูกค้าทาง LINE แล้ว" : ""}`); } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); } }
  return <div className="bookings-detail-section bookings-identity"><Icon name="users" /><div>
    <h3>ยืนยันตัวตนแทนเงินมัดจำ</h3>
    <p className={`bookings-identity-status is-${verification.status}`}>{verificationLabels[verification.status]}{verification.reused ? " (ใช้ข้อมูลเดิม)" : ""}{verification.submittedAt ? ` · ส่งเมื่อ ${stamp(String(verification.submittedAt))}` : ""}{verification.reviewedByName && verification.reviewedAt ? ` · ตรวจโดย ${verification.reviewedByName} ${stamp(String(verification.reviewedAt))}` : ""}</p>
    {verification.status === "rejected" && verification.reason && <p className="bookings-fulfillment-meta">เหตุผลที่ขอใหม่: {verification.reason}</p>}
    {verification.status !== "approved" && <p className="bookings-fulfillment-meta">จัดส่งได้หลังยืนยันตัวตนผ่าน · ในใบสรุปตั้งเงินมัดจำเป็น 0 ให้อัตโนมัติ</p>}
    {!canReview ? <p className="bookings-fulfillment-meta">บัญชีนี้ไม่มีสิทธิ์ดูเอกสารยืนยันตัวตน</p> : verification.status !== "pending" && <>
      {!data ? <button type="button" className="bookings-timeline-load" disabled={busy} onClick={load}>{busy ? "กำลังโหลด…" : "ดูเอกสาร (การเปิดดูจะถูกบันทึก)"}</button> : <div className="bookings-identity-data">
        {data.profile ? <dl><div><dt>ชื่อ-นามสกุล</dt><dd>{data.profile.fullName}</dd></div><div><dt>ที่อยู่</dt><dd>{data.profile.address}</dd></div><div><dt>เบอร์สำรอง</dt><dd>{data.profile.backupPhone}</dd></div>{data.profile.social && <div><dt>IG / FB</dt><dd>{data.profile.social}</dd></div>}</dl> : <p>ไม่พบข้อมูลลูกค้า</p>}
        <div className="bookings-identity-files">{data.files.length ? data.files.map(file => <a key={file._id} href={`/api/admin/identity/file/${file._id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/admin/identity/file/${file._id}`} alt={file.kind === "idCard" ? "บัตรประชาชน" : "เซลฟี่คู่บัตร"} /><span>{file.kind === "idCard" ? "บัตรประชาชน" : "เซลฟี่คู่บัตร"}</span></a>) : <p>ไม่มีไฟล์ (อาจถูกลบตามกำหนดแล้ว)</p>}</div>
      </div>}
      {verification.status === "submitted" && data && (asking ? <div className="bookings-inline-form"><label className="is-wide">บอกลูกค้าว่าต้องแก้อะไร<input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder="เช่น รูปบัตรไม่ชัด / ชื่อไม่ตรงกับบัตร" /></label><div><button type="button" disabled={busy} onClick={() => setAsking(false)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || !reason.trim()} onClick={() => review(false)}>ส่งให้ลูกค้าแก้</button></div></div>
        : <p className="bookings-fulfillment-wait"><button type="button" disabled={busy} onClick={() => review(true)}>✓ ผ่าน ยืนยันตัวตนแล้ว</button><button type="button" disabled={busy} onClick={() => setAsking(true)}>ขอเอกสารใหม่</button></p>)}
    </>}
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
  </div></div>;
}

export default function BookingFulfillment({ row, permissions, unitChoices, onChange }: { row: FulfillmentRow; permissions: Permission[]; unitChoices: Record<number, UnitChoice[]>; onChange: (patch: Partial<FulfillmentRow>) => void }) {
  const canShip = permissions.includes("shipping"), canRefund = permissions.includes("deposits"), canReview = permissions.includes("identity");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [shipForm, setShipForm] = useState<{ carrier: string; trackingNumber: string; units: string[] } | null>(null);
  const [returnForm, setReturnForm] = useState<{ condition: string; note: string; units: string[] } | null>(null);
  const [notice, setNotice] = useState("");
  const assigned = row.items.map(item => item.unitSku || "");
  const defaults = row.items.map((item, index) => item.unitSku || row.suggestedUnits?.[index] || "");
  const stage = rentalStage(row);
  const choicesFor = (item: FulfillmentItem) => { const list = unitChoices[item.id] || []; return item.unitSku && !list.some(choice => choice.sku === item.unitSku) ? [{ sku: item.unitSku, status: "unavailable" as const }, ...list] : list; };
  const statusOf = (item: FulfillmentItem, sku: string) => choicesFor(item).find(choice => choice.sku === sku)?.status;
  // Picks the physical piece for each booked item; pieces already recorded on the booking stay fixed when receiving it back.
  const unitPicker = (units: string[], set: (units: string[]) => void, lockAssigned: boolean) => <div className="bookings-unit-picks is-wide">{row.items.map((item, index) => {
    const status = units[index] ? statusOf(item, units[index]) : undefined;
    return <label key={index}>{item.sku || item.name}<select value={units[index]} disabled={lockAssigned && !!item.unitSku} onChange={event => set(units.map((sku, other) => other === index ? event.target.value : sku))}><option value="">ไม่ระบุชิ้น</option>{choicesFor(item).map(choice => <option key={choice.sku} value={choice.sku} disabled={units.includes(choice.sku) && units[index] !== choice.sku}>{choice.sku} · {unitStatusLabels[choice.status]}</option>)}</select>{!lockAssigned && status && status !== "available" && !(status === "rented" && item.unitSku === units[index]) && <small className="bookings-unit-warning">ชิ้นนี้ยัง{unitStatusLabels[status]} ยังไม่พร้อมให้เช่า</small>}</label>;
  })}</div>;
  const [refundForm, setRefundForm] = useState<{ refund: string; date: string; reason: string; evidence: string[] } | null>(null);
  const [logs, setLogs] = useState<Log[] | null>(null);
  const pickup = row.method === "pickup";

  async function run(task: () => Promise<void>) { setBusy(true); setError(""); try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); } }
  const refreshLogs = async () => { if (logs) setLogs((await (await fetch(`/api/admin/activity?targetId=${encodeURIComponent(row._id)}`, { cache: "no-store" })).json()).logs || []); };
  const ship = () => run(async () => { const data = await send("/api/admin/bookings", { id: row._id, action: "ship", carrier: shipForm?.carrier || "", trackingNumber: shipForm?.trackingNumber || "", units: shipForm?.units || assigned }); onChange({ shipment: data.shipment, items: data.items }); setShipForm(null); setNotice(data.lineNotified ? "บันทึกแล้ว และส่ง LINE แจ้งลูกค้าแล้ว" : "บันทึกแล้ว"); await refreshLogs(); });
  const receive = () => run(async () => { const data = await send("/api/admin/bookings", { id: row._id, action: "receiveReturn", condition: returnForm?.condition, note: returnForm?.note || "", units: returnForm?.units || assigned }); onChange({ returned: data.returned, items: data.items }); setReturnForm(null); setNotice(returnForm?.condition === "missing" ? "บันทึกรับคืนแล้ว ชิ้นที่สูญหายถูกตั้งเป็นไม่พร้อมเช่า" : "บันทึกรับคืนแล้ว ชิ้นสินค้าถูกส่งไปที่หน้าเตรียมสินค้า"); await refreshLogs(); });
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
    {row.verification && row.status !== "cancelled" && <IdentityReview row={row} canReview={canReview} onChange={verification => onChange({ verification })} />}
    {row.status !== "cancelled" && <div className="bookings-detail-section bookings-fulfillment"><Icon name="delivery" /><div>
      <h3>{pickup ? "ส่งมอบและรับคืน" : "จัดส่งและรับคืน"}</h3>
      {row.schedule && <p className="bookings-fulfillment-meta">{pickup ? "เตรียมให้ลูกค้ารับ" : "ต้องส่งของ"} <b>{day(`${row.schedule.ship}T00:00:00Z`)}</b> · ใช้งาน {day(`${row.start}T00:00:00Z`)} – {day(`${row.end}T00:00:00Z`)} · คืน {day(`${row.schedule.returnDate}T00:00:00Z`)} ({returnMethods.find(item => item.key === row.schedule!.returnMethod)?.label}) · Gap {row.schedule.gap} วัน · รับคิวใหม่ได้ {day(`${row.schedule.ready}T00:00:00Z`)}</p>}
      <div className="bookings-stage-steps" aria-label="ขั้นตอนการเช่า">{stageSteps.map((step, index) => <div key={step} className={stageSteps.indexOf(stage) >= index ? "is-current" : ""}><span>{index + 1}</span><small>{stageLabel(step, row.method)}</small></div>)}</div>
      {assigned.some(Boolean) && <p className="bookings-fulfillment-units">ชิ้นที่ใช้: {row.items.map((item, index) => assigned[index] ? `${assigned[index]}${!row.shipment && statusOf(item, assigned[index]) ? ` (${unitStatusLabels[statusOf(item, assigned[index])!]})` : ""}` : `${item.sku || item.name} (ยังไม่ระบุชิ้น)`).join(" · ")}</p>}
      {row.shipment && !shipForm ? <p className="bookings-fulfillment-done"><Icon name="success" />{pickup ? "ส่งมอบที่ร้านแล้ว" : `${row.shipment.carrier} ${row.shipment.trackingNumber}`.trim()}<small>{stamp(row.shipment.shippedAt)} · {row.shipment.byName}</small>{canShip && !row.returned && <button type="button" onClick={() => setShipForm({ carrier: row.shipment!.carrier, trackingNumber: row.shipment!.trackingNumber, units: defaults })}>แก้ไข</button>}</p>
        : !row.shipment && !shipForm ? <p className="bookings-fulfillment-wait">{pickup ? "ยังไม่ได้ส่งมอบสินค้า" : "ยังไม่ได้บันทึกเลขพัสดุ"}{canShip && <button type="button" disabled={busy} onClick={() => setShipForm({ carrier: pickup ? "" : "ไปรษณีย์ไทย", trackingNumber: "", units: defaults })}>{pickup ? "บันทึกส่งมอบ" : "บันทึกเลขพัสดุ"}</button>}</p> : null}
      {shipForm && <div className="bookings-inline-form">{unitPicker(shipForm.units, units => setShipForm({ ...shipForm, units }), false)}{!pickup && <><label>ขนส่ง<input value={shipForm.carrier} maxLength={60} onChange={event => setShipForm({ ...shipForm, carrier: event.target.value })} placeholder="ไปรษณีย์ไทย / Flash / Kerry" /></label><label>เลขพัสดุ<input value={shipForm.trackingNumber} maxLength={60} onChange={event => setShipForm({ ...shipForm, trackingNumber: event.target.value.toUpperCase() })} placeholder="EX123456789TH" /></label></>}<div><button type="button" disabled={busy} onClick={() => setShipForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || (!pickup && !shipForm.trackingNumber.trim())} onClick={ship}>{busy ? "กำลังบันทึก…" : pickup ? "ยืนยันส่งมอบแล้ว" : "บันทึกเลขพัสดุ"}</button></div></div>}
      {row.shipment && !row.returned && row.customerReturn && <p className="bookings-fulfillment-done is-customer"><Icon name="delivery" />ลูกค้าแจ้งส่งคืนแล้ว · {`${row.customerReturn.carrier} ${row.customerReturn.trackingNumber}`.trim()}<small>{stamp(row.customerReturn.at)} · รอร้านรับสินค้า</small></p>}
      {row.shipment && !row.returned && !row.customerReturn && <p className="bookings-fulfillment-meta">กำหนดส่งคืน {day(`${returnDay(row)}T00:00:00Z`)}{row.returnReminderSentAt ? ` · ส่ง LINE เตือนแล้ว ${stamp(row.returnReminderSentAt)}` : " · ระบบจะส่ง LINE เตือนลูกค้า 1 วันก่อนกำหนด"}</p>}
      {row.shipment && (row.returned ? <p className="bookings-fulfillment-done"><Icon name="success" />รับคืนแล้ว · {conditions.find(item => item.key === row.returned!.condition)?.label}<small>{stamp(row.returned.at)} · {row.returned.byName}{row.returned.note ? ` · ${row.returned.note}` : ""}</small></p>
        : !returnForm ? <p className="bookings-fulfillment-wait">ยังไม่ได้รับคืนสินค้า{canShip && <button type="button" disabled={busy} onClick={() => setReturnForm({ condition: "good", note: "", units: defaults })}>ยืนยันรับสินค้าคืน</button>}</p>
        : <div className="bookings-inline-form">{unitPicker(returnForm.units, units => setReturnForm({ ...returnForm, units }), true)}<label>สภาพสินค้า<select value={returnForm.condition} onChange={event => setReturnForm({ ...returnForm, condition: event.target.value })}>{conditions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>หมายเหตุ<input value={returnForm.note} maxLength={500} onChange={event => setReturnForm({ ...returnForm, note: event.target.value })} placeholder="เช่น มีคราบที่ชายกระโปรง" /></label><div><button type="button" disabled={busy} onClick={() => setReturnForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy} onClick={receive}>{busy ? "กำลังบันทึก…" : "ยืนยันรับคืน"}</button></div></div>)}
    </div></div>}
    {row.deposit && row.deposit.status !== "void" && <div className="bookings-detail-section bookings-deposit"><Icon name="shield" /><div>
      <h3>เงินมัดจำ</h3>
      <p className="bookings-deposit-head"><strong>{money(row.deposit.amount)} บาท</strong><span className={`bookings-deposit-badge is-${row.deposit.status}`}>{depositStatus[row.deposit.status]}</span></p>
      <p className="bookings-deposit-meta">รับเมื่อ {day(row.deposit.receivedAt)} · {row.deposit.receivedByName}</p>
      {row.deposit.refund && <div className="bookings-deposit-refund"><p>คืน <b>{money(row.deposit.refund.amount)}</b> บาท{row.deposit.refund.deducted > 0 && <> · หัก <b>{money(row.deposit.refund.deducted)}</b> บาท</>} · {day(row.deposit.refund.date)}</p>{row.deposit.refund.reason && <p>เหตุผล: {row.deposit.refund.reason}</p>}<p className="bookings-deposit-meta">บันทึกโดย {row.deposit.refund.byName} · {stamp(row.deposit.refund.at)}</p>{!!row.deposit.refund.evidence.length && <div className="bookings-evidence">{row.deposit.refund.evidence.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">หลักฐาน {index + 1}</a>)}</div>}</div>}
      {row.deposit.status === "held" && canRefund && (!row.returned ? <p className="bookings-fulfillment-wait">คืนเงินมัดจำได้หลังบันทึกรับคืนสินค้า</p>
        : !refundForm ? <p className="bookings-fulfillment-wait">รอคืนเงินมัดจำ<button type="button" disabled={busy} onClick={() => setRefundForm({ refund: String(row.deposit!.amount), date: today(), reason: "", evidence: [] })}>บันทึกคืนเงินมัดจำ</button></p>
        : <div className="bookings-inline-form"><label>ยอดคืน (บาท)<input type="number" min="0" max={row.deposit.amount} step="0.01" value={refundForm.refund} onChange={event => setRefundForm({ ...refundForm, refund: event.target.value })} /></label><label>วันที่คืน<input type="date" value={refundForm.date} max={today()} onChange={event => setRefundForm({ ...refundForm, date: event.target.value })} /></label>
          {deducted > 0 && <label className="is-wide">เหตุผลที่หัก {money(deducted)} บาท<input value={refundForm.reason} maxLength={500} required onChange={event => setRefundForm({ ...refundForm, reason: event.target.value })} placeholder="เช่น ค่าซักคราบ / ส่งคืนล่าช้า 1 วัน" /></label>}
          <label className="is-wide">หลักฐานการโอนคืน{Number(refundForm.refund) > 0 ? " (จำเป็น)" : ""}<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || refundForm.evidence.length >= 5} onChange={event => { void upload(event.target.files); event.target.value = ""; }} /></label>
          {!!refundForm.evidence.length && <div className="bookings-evidence is-wide">{refundForm.evidence.map((url, index) => <span key={url}><a href={url} target="_blank" rel="noopener noreferrer">หลักฐาน {index + 1}</a><button type="button" aria-label={`ลบหลักฐาน ${index + 1}`} onClick={() => setRefundForm({ ...refundForm, evidence: refundForm.evidence.filter(item => item !== url) })}>×</button></span>)}</div>}
          <div><button type="button" disabled={busy} onClick={() => setRefundForm(null)}>ยกเลิก</button><button type="button" className="is-primary" disabled={busy || (deducted > 0 && !refundForm.reason.trim()) || (Number(refundForm.refund) > 0 && !refundForm.evidence.length)} onClick={refund}>{busy ? "กำลังบันทึก…" : "ยืนยันคืนเงินมัดจำ"}</button></div></div>)}
    </div></div>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && !error && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    <div className="bookings-detail-section bookings-timeline"><Icon name="history" /><div>
      <h3>ประวัติการทำรายการ</h3>
      {!logs ? <button type="button" className="bookings-timeline-load" disabled={busy} onClick={loadLogs}>ดูว่าใครทำอะไรกับคำขอนี้</button>
        : logs.length ? <ol>{logs.map(log => <li key={log._id}><strong>{log.summary}</strong><small>{stamp(log.at)} · {log.actorName || log.actorEmail}</small>{!!log.changes.length && log.action !== "booking.payment_confirmed" && <ul>{log.changes.map(change => <li key={change.field}><span>{fieldLabels[change.field] || change.field}</span>{showValue(change.before)} → <b>{showValue(change.after)}</b></li>)}</ul>}</li>)}</ol>
        : <p className="bookings-fulfillment-wait">ยังไม่มีประวัติที่บันทึกไว้</p>}
    </div></div>
  </>;
}
