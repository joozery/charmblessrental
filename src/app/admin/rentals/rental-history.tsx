"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { Icon } from "@/components/ui/icon";

type RentalItem = { productName: string; sku: string; agreedPrice: number | null; notes: string; image?: string };
type Rental = {
  legacyId: string; enteredAt: string; legacyStatus?: string; customerName?: string; phone?: string; address?: string;
  shipDate: string; returnDate: string; rentalDateText?: string; days?: number | null; rentalTotal?: number | null;
  deposit?: number | null; shipping?: number | null; total?: number | null; bankId?: string; paidAt: string;
  slips?: string[]; carrier?: string; notes?: string; detailUrl?: string; enteredBy?: string; items: RentalItem[];
};

const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dateLabel = (value?: string | null) => { if (!value) return "—"; const date = new Date(value); return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear() + 543}`; };
const money = (value?: number | null) => value == null ? "—" : `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
const text = (value?: string | null) => value?.trim() || "—";
function externalUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function statusClass(value?: string) {
  if (value === "รอชำระเงิน") return "is-pending";
  if (value === "รอจัดส่ง") return "is-shipping";
  if (value === "เกินกำหนดส่ง" || value === "คืนสินค้าเลยกำหนด") return "is-overdue";
  return "is-other";
}

export default function RentalHistory({ records }: { records: Rental[] }) {
  const [selected, setSelected] = useState<Rental | null>(null);
  return <>
    <div className="rental-history-table-wrap"><table className="rental-history-table"><thead><tr><th>เลขที่รายการ</th><th>วันที่ลงข้อมูล</th><th>ลูกค้า</th><th>กำหนดเช่า</th><th>ยอดรวม</th><th>สถานะ</th><th><span className="admin-sr-only">รายละเอียด</span></th></tr></thead><tbody>
      {records.map(rental => <tr key={rental.legacyId}><td className="rental-history-id">{rental.legacyId}</td><td>{dateLabel(rental.enteredAt)}</td><td><strong className="rental-history-customer">{text(rental.customerName)}</strong><small className="rental-history-phone">{text(rental.phone)}</small></td><td className="rental-history-period">{dateLabel(rental.shipDate)}<span>ถึง</span>{dateLabel(rental.returnDate)}</td><td className="rental-history-money">{money(rental.total)}</td><td><span className={`rental-history-status ${statusClass(rental.legacyStatus)}`}>{text(rental.legacyStatus)}</span></td><td><button className="rental-history-view" type="button" onClick={() => setSelected(rental)} aria-label={`ดูรายละเอียด ${rental.legacyId}`}>ดูรายละเอียด<Icon name="arrowRight" /></button></td></tr>)}
    </tbody></table>{!records.length && <div className="rental-history-empty"><span><Icon name="search" /></span><strong>ไม่พบรายการเช่า</strong><p>ลองเปลี่ยนคำค้นหา สถานะ หรือช่วงวันที่</p></div>}</div>
    <Dialog.Root open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog rental-history-dialog"><header className="rental-dialog-header"><div><span className="rental-history-eyebrow">RENTAL DETAILS</span><Dialog.Title>{selected?.legacyId || "รายละเอียดการเช่า"}</Dialog.Title></div><span className={`rental-history-status ${statusClass(selected?.legacyStatus)}`}>{text(selected?.legacyStatus)}</span></header><Dialog.Description className="rental-dialog-description">ข้อมูลจากแท็บ “ข้อมูลการเช่า” ในไฟล์เดิม</Dialog.Description>{selected && <>
      <section className="rental-dialog-section"><h3><Icon name="users" />ข้อมูลลูกค้า</h3><div className="rental-dialog-grid"><div><span>ชื่อ</span><strong>{text(selected.customerName)}</strong></div><div><span>เบอร์โทร</span><strong>{selected.phone ? <a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>{selected.phone}</a> : "—"}</strong></div><div className="is-wide"><span>ที่อยู่จัดส่ง</span><strong className="rental-dialog-address">{text(selected.address)}</strong></div></div></section>
      <section className="rental-dialog-section"><h3><Icon name="calendar" />กำหนดการเช่า</h3><div className="rental-dialog-grid"><div><span>วันที่ลงข้อมูล</span><strong>{dateLabel(selected.enteredAt)}</strong></div><div><span>วันที่เช่า</span><strong>{text(selected.rentalDateText)}</strong></div><div><span>วันที่จัดส่ง</span><strong>{dateLabel(selected.shipDate)}</strong></div><div><span>วันที่คืน</span><strong>{dateLabel(selected.returnDate)}</strong></div><div><span>จำนวนวัน</span><strong>{selected.days == null ? "—" : `${selected.days} วัน`}</strong></div><div><span>ขนส่ง</span><strong>{text(selected.carrier)}</strong></div></div></section>
      <section className="rental-dialog-section"><h3><Icon name="payment" />การชำระเงิน</h3><div className="rental-dialog-grid"><div><span>ค่าเช่ารวม</span><strong>{money(selected.rentalTotal)}</strong></div><div><span>เงินมัดจำ</span><strong>{money(selected.deposit)}</strong></div><div><span>ค่าส่ง</span><strong>{money(selected.shipping)}</strong></div><div><span>ยอดรวมสุทธิ</span><strong>{money(selected.total)}</strong></div><div><span>บัญชีที่รับโอน</span><strong>{text(selected.bankId)}</strong></div><div><span>วันที่ชำระเงิน</span><strong>{dateLabel(selected.paidAt)}</strong></div></div>
        {!!selected.slips?.length && <div className="rental-dialog-files"><span>หลักฐานการโอน</span><div>{selected.slips.map((slip, index) => { const href = externalUrl(slip); return href ? <a href={href} key={`${slip}-${index}`} target="_blank" rel="noopener noreferrer"><Icon name="image" />สลิป {index + 1}<Icon name="arrow" /></a> : <span key={`${slip}-${index}`}><Icon name="image" />แนบไฟล์ {index + 1}</span>; })}</div></div>}
      </section>
      <section className="rental-dialog-section"><h3><Icon name="box" />สินค้าในรายการ</h3>{selected.items.length ? <div className="rental-dialog-products">{selected.items.map((item, index) => <article key={`${item.sku || item.productName}-${index}`}><span className="rental-dialog-product-image">{item.image ? <Image unoptimized src={item.image} alt={item.productName} width={54} height={68} /> : <Icon name="image" />}</span><div><strong>{item.productName}</strong><small>{item.sku || "ไม่มีรหัสสินค้า"}{item.agreedPrice != null ? ` · ${money(item.agreedPrice)}` : ""}</small>{item.notes && <small>{item.notes}</small>}</div></article>)}</div> : <p className="rental-dialog-no-items">ยังไม่มีสินค้าเชื่อมกับรายการเช่านี้</p>}</section>
      {(selected.notes || selected.enteredBy || selected.detailUrl) && <section className="rental-dialog-section"><h3><Icon name="help" />บันทึกเพิ่มเติม</h3><div className="rental-dialog-grid"><div><span>ผู้ลงข้อมูล</span><strong>{text(selected.enteredBy)}</strong></div>{selected.notes && <div className="is-wide"><span>หมายเหตุ</span><strong>{selected.notes}</strong></div>}{externalUrl(selected.detailUrl) && <div className="is-wide"><span>เอกสารประกอบ</span><strong><a href={externalUrl(selected.detailUrl)} target="_blank" rel="noopener noreferrer">เปิดใบรายละเอียดการเช่า<Icon name="arrow" /></a></strong></div>}</div></section>}
      </>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดรายละเอียด"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
