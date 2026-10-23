import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import { RentalDocument, dateLabel, money, quoteForRow, safeUrl, type DocRow } from "@/components/rental-document";
import { unitsOf, type Product, type UnitStatus } from "@/lib/products";
import { rentalStage, stageLabel, stageSteps } from "@/lib/rental-stage";
import { returnDay } from "@/lib/schedule";
import PrintButton from "./print-button";
import ReturnForm from "./return-form";
import IdentityForm from "./identity-form";
import RefundAccountForm from "./refund-account-form";
import { deposits } from "@/lib/finance";
import type { RefundAccount } from "@/lib/refund-account";
import { activeExtensions, extendedDays, extensionLabels, lastUseDay, lateReturnLabels, type Extension, type LateReturn } from "@/lib/extension";
import { verificationLabels, type BookingVerification } from "@/lib/identity";
import "@/app/admin/bookings/bookings.css";
import "./bill.css";
import { adjustmentLabels, type Adjustment } from "@/lib/adjustment";

export const metadata = { title: "ใบรายละเอียดการเช่า | Charm Bless", robots: { index: false, follow: false } };
type BillDoc = Omit<DocRow, "createdAt" | "items"> & {
  status: string; payment?: "unpaid" | "paid"; billToken: string; createdAt: Date; method?: string; items: (DocRow["items"][number] & { unitSku?: string })[];
  verification?: BookingVerification; refundAccount?: RefundAccount; extensions?: Extension[]; lateReturn?: LateReturn; adjustments?: Adjustment[]; shipment?: { carrier: string; trackingNumber: string; shippedAt: Date }; customerReturn?: { carrier: string; trackingNumber: string; at: Date }; returned?: { at: Date };
};
// What the next customer sees while their reserved piece is still being prepared.
const prepText: Partial<Record<UnitStatus, string>> = { rented: "รอรับสินค้าคืนจากลูกค้ารอบก่อน", inspection: "กำลังตรวจสภาพสินค้า", washing: "กำลังซักและทำความสะอาด", repair: "กำลังดูแลซ่อมแซม" };
const when = (value: Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));
type PageProps = { params: Promise<{ token: string }> };

async function Content({ params }: PageProps) {
  await connection();
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const row = await (await database()).collection<BillDoc>("bookingRequests").findOne({ billToken: token }, { projection: { _id: 1, status: 1, payment: 1, name: 1, phone: 1, address: 1, start: 1, end: 1, days: 1, deliveryFee: 1, quote: 1, items: 1, createdAt: 1, method: 1, schedule: 1, verification: 1, refundAccount: 1, extensions: 1, lateReturn: 1, adjustments: 1, "shipment.carrier": 1, "shipment.trackingNumber": 1, "shipment.shippedAt": 1, "customerReturn.carrier": 1, "customerReturn.trackingNumber": 1, "customerReturn.at": 1, "returned.at": 1 } });
  if (!row) notFound();
  const stage = rentalStage(row), pickup = row.method === "pickup";
  const skus = row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku);
  const preparing = stage === "paid" || (stage === "pending" && row.status === "confirmed");
  const unitStatus = new Map<string, UnitStatus>();
  if (preparing && skus.length) for (const product of await (await database()).collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, cost: 1, active: 1, legacyId: 1, units: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skus.includes(unit.sku)) unitStatus.set(unit.sku, unit.status);
  const settings = await getStoreSettings();
  const { shipment, customerReturn, returned, verification, refundAccount, extensions, lateReturn, adjustments, ...rest } = row;
  const extended = activeExtensions(extensions), unpaidExtension = extended.find(item => item.status === "unpaid");
  // Deposit customers say where the deposit goes back, and see when the shop has sent it.
  const askRefund = !verification && row.status !== "cancelled" && (!row.quote || (row.quote.deposit || 0) > 0);
  const deposit = askRefund ? await deposits(await database()).findOne({ _id: String(row._id) }) : null;
  const refunded = deposit?.refund && deposit.status !== "held" && deposit.status !== "void" ? deposit.refund : null;
  const doc: DocRow = { ...rest, verification: verification || null, _id: String(row._id), createdAt: new Date(row.createdAt).toISOString() };
  const store = { logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument };
  const quote = quoteForRow(doc, settings.rentalDocument);
  // Payments made later (an extension, a late fine) go to the account in use today, not the one on the original bill.
  const today = settings.rentalDocument;
  const paid = row.payment === "paid";
  return <main className="bill-page">
    <header className="bill-head"><div><span>CHARM BLESS RENTAL</span><h1>ใบรายละเอียดการเช่า</h1><p>เลขที่คำขอ {doc._id}</p></div>{row.status !== "cancelled" && row.quote && <strong className={paid ? "bill-status is-paid" : "bill-status"}>{paid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</strong>}</header>
    {row.status !== "cancelled" && verification && !returned && <div className={`bill-track bill-identity is-${verification.status}`}><strong>ยืนยันตัวตนแทนเงินมัดจำ · {verificationLabels[verification.status]}</strong>
            {verification.status === "approved" ? <p>✅ เรียบร้อยแล้ว ไม่ต้องวางเงินมัดจำ{verification.reused ? " (ใช้ข้อมูลยืนยันตัวตนเดิม)" : ""}</p>
              : verification.status === "submitted" ? <p>ร้านได้รับเอกสารแล้ว กำลังตรวจ จะแจ้งผลทาง LINE ค่ะ</p>
              : <>{verification.status === "rejected" && verification.reason && <p className="bill-error">ร้านขอเอกสารใหม่: {verification.reason}</p>}<p>ส่งก่อนวันจัดส่ง{row.schedule ? ` (${dateLabel(row.schedule.ship)})` : ""} ไม่เช่นนั้นร้านจะจัดส่งไม่ได้</p><IdentityForm token={token} defaults={{ fullName: row.name || "" }} deleteAfterDays={settings.verification.deleteAfterDays} examples={settings.verification.examples} /></>}
          </div>}
    {row.status !== "cancelled" && extended.length > 0 && <div className="bill-track bill-extension"><strong>ค่าเช่าต่อ{unpaidExtension ? " · รอชำระ" : ""}</strong>
      <ul>{extended.map(item => <li key={item.id}><span>เช่าต่อ +{item.addedDays} วัน · ใช้งานได้ถึง {dateLabel(item.toEnd)}</span><b>{money(item.amount)} บาท</b><small className={`is-${item.status}`}>{extensionLabels[item.status]}</small></li>)}</ul>
      {unpaidExtension && <div className="bill-extension-pay">{today.qrImage && safeUrl(today.qrImage) && <img src={safeUrl(today.qrImage)} alt="QR ชำระเงิน" />}<p>โอนค่าเช่าต่อ <b>{money(unpaidExtension.amount)} บาท</b><br />ธนาคาร {today.bank} · เลขบัญชี <b>{today.accountNumber}</b><br />ชื่อบัญชี {today.accountName}<br />แล้วส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ {doc._id}</p></div>}
      {returnDay(doc) && !returned && <p>กำหนดส่งคืนชุดใหม่ <b>{dateLabel(returnDay(doc))}</b></p>}
    </div>}
    {row.status !== "cancelled" && !!adjustments?.length && <div className="bill-track bill-extension"><strong>ส่วนต่างจากการแก้ไขการจอง</strong>
      <ul>{adjustments.map(item => <li key={item.id}><span>{item.summary}</span><b>{item.amount > 0 ? "" : "คืน "}{money(Math.abs(item.amount))} บาท</b><small className={`is-${item.status === "unpaid" || item.status === "refund" ? "unpaid" : "paid"}`}>{adjustmentLabels[item.status]}</small></li>)}</ul>
      {adjustments.some(item => item.status === "unpaid") && <div className="bill-extension-pay">{today.qrImage && safeUrl(today.qrImage) && <img src={safeUrl(today.qrImage)} alt="QR ชำระเงิน" />}<p>โอนส่วนต่าง <b>{money(adjustments.filter(item => item.status === "unpaid").reduce((sum, item) => sum + item.amount, 0))} บาท</b><br />ธนาคาร {today.bank} · เลขบัญชี <b>{today.accountNumber}</b><br />ชื่อบัญชี {today.accountName}<br />แล้วส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ {doc._id}</p></div>}
    </div>}
    {row.status !== "cancelled" && lateReturn && lateReturn.fine > 0 && <div className="bill-track bill-extension"><strong>ค่าปรับส่งคืนล่าช้า{lateReturn.status === "unpaid" ? " · รอชำระ" : ""}</strong>
      <ul><li><span>กำหนดคืน {dateLabel(lateReturn.dueDate)} · คืนจริง {dateLabel(lateReturn.actualDate)} (ช้า {lateReturn.days} วัน)</span><b>{money(lateReturn.fine)} บาท</b><small className={`is-${lateReturn.status === "unpaid" ? "unpaid" : "paid"}`}>{lateReturnLabels[lateReturn.status]}</small></li></ul>
      {lateReturn.status === "unpaid" && <div className="bill-extension-pay">{today.qrImage && safeUrl(today.qrImage) && <img src={safeUrl(today.qrImage)} alt="QR ชำระเงิน" />}<p>โอนค่าปรับ <b>{money(lateReturn.fine)} บาท</b><br />ธนาคาร {today.bank} · เลขบัญชี <b>{today.accountNumber}</b><br />ชื่อบัญชี {today.accountName}<br />{deposit?.status === "held" ? "หรือร้านจะหักจากเงินมัดจำตอนคืนเงิน" : `แล้วส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ ${doc._id}`}</p></div>}
    </div>}
    {askRefund && <div className="bill-track bill-refund"><strong>บัญชีรับเงินมัดจำคืน</strong>
      {refunded ? <p>{refunded.amount > 0 ? <>✅ ร้านโอนเงินมัดจำคืนแล้ว <b>{money(refunded.amount)} บาท</b>{refundAccount ? ` เข้าบัญชี ${refundAccount.bank} ${refundAccount.accountNumber}` : ""}</> : "ร้านไม่ได้คืนเงินมัดจำรายการนี้"}{refunded.deducted > 0 ? ` · หัก ${money(refunded.deducted)} บาท (${refunded.reason})` : ""}</p>
        : <>{!refundAccount && <p>{shipment ? "⚠️ กรุณากรอกบัญชีก่อนส่งชุดคืน ร้านจะโอนเงินมัดจำคืนหลังได้รับชุดและตรวจสภาพแล้ว" : "ร้านจะโอนเงินมัดจำคืนเข้าบัญชีนี้หลังได้รับชุดคืนและตรวจสภาพแล้ว"}</p>}<RefundAccountForm token={token} saved={refundAccount || null} /></>}
    </div>}
    {row.status === "cancelled" ? <p className="bill-notice">คำขอนี้ถูกยกเลิกแล้ว หากมีข้อสงสัยกรุณาติดต่อร้านทาง LINE</p>
      : !row.quote ? <p className="bill-notice">ร้านกำลังจัดทำบิลของคุณ กรุณารอสักครู่ หรือติดต่อร้านทาง LINE</p>
      : <>
        <section className="bill-track" aria-label="สถานะการเช่า">
          <h2>สถานะการเช่า</h2>
          <ol className="bill-steps">{stageSteps.map((step, index) => <li key={step} className={stageSteps.indexOf(stage) >= index ? "is-done" : ""}><span>{index + 1}</span>{stageLabel(step, row.method)}</li>)}</ol>
          {preparing && <div className="bill-track-box"><strong>การเตรียมสินค้า</strong><ul>{row.items.map((item, index) => { const status = item.unitSku ? unitStatus.get(item.unitSku) : undefined; return <li key={index}><span>{item.name}</span>{status === "available" ? <b className="is-ready">เตรียมสินค้าเรียบร้อย {pickup ? "พร้อมให้รับ" : "พร้อมจัดส่ง"}</b> : <b>{(status && prepText[status]) || "ร้านกำลังจัดเตรียมสินค้า"}</b>}</li>; })}</ul></div>}
          {shipment && <div className="bill-track-box"><strong>{pickup ? "การรับสินค้า" : "การจัดส่ง"}</strong><p>{pickup ? `รับสินค้าที่ร้านแล้ว · ${when(shipment.shippedAt)}` : <>{shipment.carrier} <b className="bill-tracking">{shipment.trackingNumber}</b> · ส่งเมื่อ {when(shipment.shippedAt)}</>}</p><p>กำหนดส่งคืน <b>{dateLabel(returnDay(doc))}</b>{!returned && !customerReturn && " · ร้านจะส่ง LINE เตือนก่อนถึงกำหนด 1 วัน"}</p></div>}
          {shipment && !returned && <div className="bill-track-box"><strong>แจ้งส่งคืนสินค้า</strong>{customerReturn ? <p className="bill-reported">แจ้งแล้ว: {`${customerReturn.carrier} ${customerReturn.trackingNumber}`.trim()} · {when(customerReturn.at)}<br />รอร้านรับสินค้า ร้านจะยืนยันเมื่อได้รับพัสดุจริง</p> : <p>เมื่อส่งสินค้าคืนแล้ว กรุณาแจ้งขนส่งและเลขพัสดุด้านล่าง{doc.quote?.returnAddress ? ` (ที่อยู่ส่งคืน: ${doc.quote.returnAddress}${doc.quote.returnPhone ? ` · ${doc.quote.returnPhone}` : ""})` : ""}</p>}<ReturnForm token={token} reported={customerReturn ? { carrier: customerReturn.carrier, trackingNumber: customerReturn.trackingNumber } : null} /></div>}
          {returned && <div className="bill-track-box"><strong>ร้านรับสินค้าคืนแล้ว</strong><p>{when(returned.at)} · ขอบคุณที่ใช้บริการค่ะ</p></div>}
        </section>
        {!paid && <section className="bill-pay"><strong>วิธีชำระเงิน</strong><ol><li>ตรวจสอบยอดและรายละเอียดในใบด้านล่าง</li><li>โอนเงินให้ตรงตามยอดสุทธิ <b>{money(quote.rental + quote.deposit + quote.shipping)} บาท</b> ผ่าน QR หรือเลขบัญชีในใบ</li><li>ส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ {doc._id}</li></ol></section>}
        <div className="bill-actions">{settings.lineUrl && <a className="bill-button is-primary" href={settings.lineUrl} target="_blank" rel="noopener noreferrer">ส่งสลิป / ติดต่อร้านทาง LINE</a>}<PrintButton /></div>
        <p className="bill-meta">วันใช้งาน {dateLabel(doc.start)} – {dateLabel(lastUseDay({ end: doc.end, extensions }))} · {doc.days + extendedDays({ extensions })} วัน{extended.length ? ` (รวมเช่าต่อ +${extendedDays({ extensions })} วัน)` : ""}</p>
        <div className="bill-paper"><RentalDocument row={doc} quote={quote} store={store} /></div>
      </>}
  </main>;
}

export default function Page({ params }: PageProps) {
  return <Suspense fallback={<main className="bill-page" role="status">กำลังโหลดบิล…</main>}><Content params={params} /></Suspense>;
}
