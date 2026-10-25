import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { headers } from "next/headers";
import { billQrPayload } from "@/lib/bill-qr";
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
import SlipForm, { type SlipState } from "./slip-form";
import { billDue, paymentSlips } from "@/lib/payment-slips";
import { slip2goConfigured } from "@/lib/slip2go";
import { deposits } from "@/lib/finance";
import type { RefundAccount } from "@/lib/refund-account";
import { activeExtensions, extendedDays, extensionLabels, lastUseDay, type Extension } from "@/lib/extension";
import { verificationLabels, type BookingVerification } from "@/lib/identity";
import { depositFor } from "@/lib/pricing";
import "@/app/admin/bookings/bookings.css";
import "./bill.css";

export const metadata = { title: "ใบรายละเอียดการเช่า | Charm Bless", robots: { index: false, follow: false } };
type BillDoc = Omit<DocRow, "createdAt" | "items"> & {
  status: string; payment?: "unpaid" | "paid"; billToken: string; createdAt: Date; method?: string; items: (DocRow["items"][number] & { unitSku?: string })[];
  verification?: BookingVerification; refundAccount?: RefundAccount; extensions?: Extension[]; shipment?: { carrier: string; trackingNumber: string; shippedAt: Date }; customerReturn?: { carrier: string; trackingNumber: string; at: Date }; returned?: { at: Date };
};
// What the next customer sees while their reserved piece is still being prepared.
const prepText: Partial<Record<UnitStatus, string>> = { rented: "รอรับสินค้าคืนจากลูกค้ารอบก่อน", inspection: "กำลังตรวจสภาพสินค้า", washing: "กำลังซักและทำความสะอาด", repair: "กำลังดูแลซ่อมแซม" };
const when = (value: Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));
type PageProps = { params: Promise<{ token: string }> };

async function Content({ params }: PageProps) {
  await connection();
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const db = await database();
  const row = await db.collection<BillDoc>("bookingRequests").findOne({ $or: [{ billToken: token }, { "extensions.billToken": token }] }, { projection: { _id: 1, billToken: 1, status: 1, payment: 1, name: 1, phone: 1, address: 1, start: 1, end: 1, days: 1, deliveryFee: 1, quote: 1, items: 1, createdAt: 1, method: 1, schedule: 1, verification: 1, refundAccount: 1, extensions: 1, "shipment.carrier": 1, "shipment.trackingNumber": 1, "shipment.shippedAt": 1, "customerReturn.carrier": 1, "customerReturn.trackingNumber": 1, "customerReturn.at": 1, "returned.at": 1 } });
  if (!row) notFound();
  const stage = rentalStage(row), pickup = row.method === "pickup";
  const skus = row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku);
  const preparing = stage === "paid" || (stage === "pending" && row.status === "confirmed");
  const unitStatus = new Map<string, UnitStatus>();
  if (preparing && skus.length) for (const product of await db.collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, cost: 1, active: 1, legacyId: 1, units: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skus.includes(unit.sku)) unitStatus.set(unit.sku, unit.status);
  const settings = await getStoreSettings();
  const productIds = row.items.map(item => item.id);
  const depositProducts = await db.collection<Product>("products").find({ id: { $in: productIds } }, { projection: { _id: 0, id: 1, deposit: 1, category: 1 } }).toArray();
  const depositByProduct = new Map(depositProducts.map(product => [product.id, depositFor(product, settings.categoryDeposits)]));
  const { shipment, customerReturn, returned, verification, refundAccount, extensions, ...rest } = row;
  const extended = activeExtensions(extensions), unpaidExtension = extended.find(item => item.status === "unpaid");
  const extensionBill = extended.find(item => item.billToken === token);
  // Deposit customers say where the deposit goes back, and see when the shop has sent it.
  const askRefund = !verification && row.status !== "cancelled" && (!row.quote || (row.quote.deposit || 0) > 0);
  const deposit = askRefund ? await deposits(db).findOne({ _id: String(row._id) }) : null;
  const refunded = deposit?.refund && deposit.status !== "held" && deposit.status !== "void" ? deposit.refund : null;
  const doc: DocRow = { ...rest, items: rest.items.map(item => ({ ...item, deposit: item.deposit ?? item.depositPrice ?? depositByProduct.get(item.id) ?? 0 })), verification: verification || null, _id: String(row._id), createdAt: new Date(row.createdAt).toISOString() };
  const store = { logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument };
  const quote = quoteForRow(doc, settings.rentalDocument);
  const paid = extensionBill ? extensionBill.status === "paid" : row.payment === "paid";
  // When the shop has read its QR, each unpaid bill shows a QR with its own amount, so the customer's app fills it in.
  const head = await headers(), host = head.get("host") || "";
  const origin = `${head.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https")}://${host}`;
  const qrFor = (billToken: string | undefined, amount: number) => billToken && amount > 0 && billQrPayload(settings.rentalDocument, row.quote, amount) ? `${origin}/bill/${billToken}/qr?v=${amount}` : "";
  const mainQr = !paid && row.quote && row.status !== "cancelled" ? qrFor(row.billToken, billDue(row.quote)) : "";
  const billAmount = extensionBill ? extensionBill.amount : billDue(row.quote);
  const billQr = !paid && row.status !== "cancelled" ? qrFor(extensionBill ? token : row.billToken, billAmount) : "";
  const shownQuote = mainQr ? { ...quote, qrImage: mainQr } : quote;
  // Customers attach the transfer slip here when the shop has Slip2Go set up; otherwise they send it on LINE.
  const slipCheck = !paid && !!row.quote && row.status !== "cancelled" && slip2goConfigured();
  const lastSlip = slipCheck ? await (await paymentSlips(await database())).findOne(extensionBill ? { bookingId: String(row._id), billToken: token } : { bookingId: String(row._id), $or: [{ billToken: token }, { billToken: { $exists: false } }] }, { projection: { status: 1, reason: 1 }, sort: { createdAt: -1 } }) : null;
  const slipState: SlipState = lastSlip && (lastSlip.status === "review" || lastSlip.status === "rejected" || lastSlip.status === "checking") ? { status: lastSlip.status, reason: lastSlip.reason } : null;
  return <main className="bill-page">
    <header className="bill-head"><div><span>CHARM BLESS RENTAL</span><h1>{extensionBill ? "ใบเรียกเก็บค่าเช่า/ค่าปรับเพิ่มเติม" : "ใบรายละเอียดการเช่า"}</h1><p>เลขที่คำขอ {doc._id}</p></div>{row.status !== "cancelled" && row.quote && <strong className={extensionBill ? `bill-status${extensionBill.status === "paid" ? " is-paid" : ""}` : paid ? "bill-status is-paid" : "bill-status"}>{extensionBill ? extensionLabels[extensionBill.status] : paid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</strong>}</header>
    {extensionBill && <section className="bill-track bill-extension" aria-label="บิลค่าใช้จ่ายเพิ่มเติม"><strong>{extensionBill.chargeType === "penalty" ? "บิลค่าปรับ / ยอดเรียกเก็บเพิ่ม" : extensionBill.lateDays ? "ค่าปรับส่งคืนล่าช้า" : "ค่าเช่าต่อ"}</strong>{extensionBill.note && <p>รายละเอียด: {extensionBill.note}</p>}<p>{extensionBill.chargeType === "penalty" ? "ยอดที่ต้องชำระ" : <>ใช้งานถึงวันที่ <b>{dateLabel(extensionBill.toEnd)}</b> · {extensionBill.lateDays ? `${extensionBill.lateDays} วัน × 100 บาท = ` : ""}</>} <b>{money(extensionBill.amount)} บาท</b></p>{extensionBill.status === "unpaid" && <div className="bill-extension-pay">{qrFor(extensionBill.billToken, extensionBill.amount) && <img src={qrFor(extensionBill.billToken, extensionBill.amount)} alt="QR ชำระเงิน" />}<p>กรุณาชำระภายใน 1 ชั่วโมง<br />ธนาคาร {quote.bank} · เลขบัญชี <b>{quote.accountNumber}</b><br />ชื่อบัญชี {quote.accountName}<br />{slipCheck ? "แนบสลิปในช่องด้านล่าง ระบบจะตรวจสอบให้อัตโนมัติ" : `ส่งสลิปทาง LINE พร้อมเลขที่คำขอ ${doc._id}`}</p></div>}</section>}
    {row.status !== "cancelled" && verification && !returned && <div className={`bill-track bill-identity is-${verification.status}`}><strong>ยืนยันตัวตนแทนเงินมัดจำ · {verificationLabels[verification.status]}</strong>
            {verification.status === "approved" ? <p>✅ เรียบร้อยแล้ว ไม่ต้องวางเงินมัดจำ{verification.reused ? " (ใช้ข้อมูลยืนยันตัวตนเดิม)" : ""}</p>
              : verification.status === "submitted" ? <p>ร้านได้รับเอกสารแล้ว กำลังตรวจ จะแจ้งผลทาง LINE ค่ะ</p>
              : <>{verification.status === "rejected" && verification.reason && <p className="bill-error">ร้านขอเอกสารใหม่: {verification.reason}</p>}<p>ส่งก่อนวันจัดส่ง{row.schedule ? ` (${dateLabel(row.schedule.ship)})` : ""} ไม่เช่นนั้นร้านจะจัดส่งไม่ได้</p><IdentityForm token={token} defaults={{ fullName: row.name || "", address: row.address || "" }} deleteAfterDays={settings.verification.deleteAfterDays} examples={settings.verification.examples} /></>}
          </div>}
    {row.status !== "cancelled" && extended.length > 0 && <div className="bill-track bill-extension"><strong>ค่าเช่าต่อ{unpaidExtension ? " · รอชำระ" : ""}</strong>
      <ul>{extended.map(item => <li key={item.id}><span>เช่าต่อ +{item.addedDays} วัน · ใช้งานได้ถึง {dateLabel(item.toEnd)}</span><b>{money(item.amount)} บาท</b><small className={`is-${item.status}`}>{extensionLabels[item.status]}</small></li>)}</ul>
      {unpaidExtension && <div className="bill-extension-pay">{(qrFor(unpaidExtension.billToken, unpaidExtension.amount) || safeUrl(quote.qrImage)) && <img src={qrFor(unpaidExtension.billToken, unpaidExtension.amount) || safeUrl(quote.qrImage)} alt="QR ชำระเงิน" />}<p>โอนค่าเช่าต่อ <b>{money(unpaidExtension.amount)} บาท</b><br />ธนาคาร {quote.bank} · เลขบัญชี <b>{quote.accountNumber}</b><br />ชื่อบัญชี {quote.accountName}<br />แล้วส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ {doc._id}</p></div>}
      {returnDay(doc) && !returned && <p>กำหนดส่งคืนชุดใหม่ <b>{dateLabel(returnDay(doc))}</b></p>}
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
        {!paid && <section className="bill-pay"><strong>วิธีชำระเงิน{extensionBill ? " · บิลส่วนต่าง" : ""}</strong><ol><li>ตรวจสอบยอดและรายละเอียดในใบด้านบน</li><li>โอนเงินให้ตรงตามยอดที่ต้องชำระ <b>{money(billAmount)} บาท</b> {billQr ? "สแกน QR นี้ ยอดจะขึ้นให้อัตโนมัติ (หรือโอนเข้าเลขบัญชีในใบ)" : "ผ่าน QR หรือเลขบัญชีในใบ"}</li><li>{slipCheck ? "แนบสลิปด้านล่าง ระบบจะตรวจและยืนยันการชำระให้อัตโนมัติ ไม่ต้องกดยืนยันรับเงินซ้ำ" : `ส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ ${doc._id}`}</li></ol>{slipCheck && <SlipForm key={slipState ? `${slipState.status}:${slipState.reason}` : ""} token={token} last={slipState} />}</section>}
        <div className="bill-actions">{settings.lineUrl && <a className="bill-button is-primary" href={settings.lineUrl} target="_blank" rel="noopener noreferrer">ส่งสลิป / ติดต่อร้านทาง LINE</a>}<PrintButton /></div>
        <p className="bill-meta">วันใช้งาน {dateLabel(doc.start)} – {dateLabel(lastUseDay({ end: doc.end, extensions }))} · {doc.days + extendedDays({ extensions })} วัน{extended.length ? ` (รวมเช่าต่อ +${extendedDays({ extensions })} วัน)` : ""}</p>
        <div className="bill-paper"><RentalDocument row={doc} quote={shownQuote} store={store} /></div>
      </>}
  </main>;
}

export default function Page({ params }: PageProps) {
  return <Suspense fallback={<main className="bill-page" role="status">กำลังโหลดบิล…</main>}><Content params={params} /></Suspense>;
}
