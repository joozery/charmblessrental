import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import { RentalDocument, dateLabel, money, quoteForRow, type DocRow } from "@/components/rental-document";
import { unitsOf, type Product, type UnitStatus } from "@/lib/products";
import { rentalStage, stageLabel, stageSteps } from "@/lib/rental-stage";
import PrintButton from "./print-button";
import ReturnForm from "./return-form";
import "@/app/admin/bookings/bookings.css";
import "./bill.css";

export const metadata = { title: "ใบรายละเอียดการเช่า | Charm Bless", robots: { index: false, follow: false } };
type BillDoc = Omit<DocRow, "createdAt" | "items"> & {
  status: string; payment?: "unpaid" | "paid"; billToken: string; createdAt: Date; method?: string; items: (DocRow["items"][number] & { unitSku?: string })[];
  shipment?: { carrier: string; trackingNumber: string; shippedAt: Date }; customerReturn?: { carrier: string; trackingNumber: string; at: Date }; returned?: { at: Date };
};
// What the next customer sees while their reserved piece is still being prepared.
const prepText: Partial<Record<UnitStatus, string>> = { rented: "รอรับสินค้าคืนจากลูกค้ารอบก่อน", inspection: "กำลังตรวจสภาพสินค้า", washing: "กำลังซักและทำความสะอาด", repair: "กำลังดูแลซ่อมแซม" };
const when = (value: Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));
type PageProps = { params: Promise<{ token: string }> };

async function Content({ params }: PageProps) {
  await connection();
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const row = await (await database()).collection<BillDoc>("bookingRequests").findOne({ billToken: token }, { projection: { _id: 1, status: 1, payment: 1, name: 1, phone: 1, address: 1, start: 1, end: 1, days: 1, deliveryFee: 1, quote: 1, items: 1, createdAt: 1, method: 1, "shipment.carrier": 1, "shipment.trackingNumber": 1, "shipment.shippedAt": 1, "customerReturn.carrier": 1, "customerReturn.trackingNumber": 1, "customerReturn.at": 1, "returned.at": 1 } });
  if (!row) notFound();
  const stage = rentalStage(row), pickup = row.method === "pickup";
  const skus = row.items.map(item => item.unitSku).filter((sku): sku is string => !!sku);
  const preparing = stage === "paid" || (stage === "pending" && row.status === "confirmed");
  const unitStatus = new Map<string, UnitStatus>();
  if (preparing && skus.length) for (const product of await (await database()).collection<Product>("products").find({ "units.sku": { $in: skus } }, { projection: { _id: 0, id: 1, sku: 1, cost: 1, active: 1, legacyId: 1, units: 1 } }).toArray()) for (const unit of unitsOf(product)) if (skus.includes(unit.sku)) unitStatus.set(unit.sku, unit.status);
  const settings = await getStoreSettings();
  const { shipment, customerReturn, returned, ...rest } = row;
  const doc: DocRow = { ...rest, _id: String(row._id), createdAt: new Date(row.createdAt).toISOString() };
  const store = { logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument };
  const quote = quoteForRow(doc, settings.rentalDocument);
  const paid = row.payment === "paid";
  return <main className="bill-page">
    <header className="bill-head"><div><span>CHARM BLESS RENTAL</span><h1>ใบรายละเอียดการเช่า</h1><p>เลขที่คำขอ {doc._id}</p></div>{row.status !== "cancelled" && row.quote && <strong className={paid ? "bill-status is-paid" : "bill-status"}>{paid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</strong>}</header>
    {row.status === "cancelled" ? <p className="bill-notice">คำขอนี้ถูกยกเลิกแล้ว หากมีข้อสงสัยกรุณาติดต่อร้านทาง LINE</p>
      : !row.quote ? <p className="bill-notice">ร้านกำลังจัดทำบิลของคุณ กรุณารอสักครู่ หรือติดต่อร้านทาง LINE</p>
      : <>
        <section className="bill-track" aria-label="สถานะการเช่า">
          <h2>สถานะการเช่า</h2>
          <ol className="bill-steps">{stageSteps.map((step, index) => <li key={step} className={stageSteps.indexOf(stage) >= index ? "is-done" : ""}><span>{index + 1}</span>{stageLabel(step, row.method)}</li>)}</ol>
          {preparing && <div className="bill-track-box"><strong>การเตรียมสินค้า</strong><ul>{row.items.map((item, index) => { const status = item.unitSku ? unitStatus.get(item.unitSku) : undefined; return <li key={index}><span>{item.name}</span>{status === "available" ? <b className="is-ready">เตรียมสินค้าเรียบร้อย {pickup ? "พร้อมให้รับ" : "พร้อมจัดส่ง"}</b> : <b>{(status && prepText[status]) || "ร้านกำลังจัดเตรียมสินค้า"}</b>}</li>; })}</ul></div>}
          {shipment && <div className="bill-track-box"><strong>{pickup ? "การรับสินค้า" : "การจัดส่ง"}</strong><p>{pickup ? `รับสินค้าที่ร้านแล้ว · ${when(shipment.shippedAt)}` : <>{shipment.carrier} <b className="bill-tracking">{shipment.trackingNumber}</b> · ส่งเมื่อ {when(shipment.shippedAt)}</>}</p><p>กำหนดส่งคืน <b>{dateLabel(doc.end)}</b>{!returned && !customerReturn && " · ร้านจะส่ง LINE เตือนก่อนถึงกำหนด 1 วัน"}</p></div>}
          {shipment && !returned && <div className="bill-track-box"><strong>แจ้งส่งคืนสินค้า</strong>{customerReturn ? <p className="bill-reported">แจ้งแล้ว: {`${customerReturn.carrier} ${customerReturn.trackingNumber}`.trim()} · {when(customerReturn.at)}<br />รอร้านรับสินค้า ร้านจะยืนยันเมื่อได้รับพัสดุจริง</p> : <p>เมื่อส่งสินค้าคืนแล้ว กรุณาแจ้งขนส่งและเลขพัสดุด้านล่าง{doc.quote?.returnAddress ? ` (ที่อยู่ส่งคืน: ${doc.quote.returnAddress}${doc.quote.returnPhone ? ` · ${doc.quote.returnPhone}` : ""})` : ""}</p>}<ReturnForm token={token} reported={customerReturn ? { carrier: customerReturn.carrier, trackingNumber: customerReturn.trackingNumber } : null} /></div>}
          {returned && <div className="bill-track-box"><strong>ร้านรับสินค้าคืนแล้ว</strong><p>{when(returned.at)} · ขอบคุณที่ใช้บริการค่ะ</p></div>}
        </section>
        {!paid && <section className="bill-pay"><strong>วิธีชำระเงิน</strong><ol><li>ตรวจสอบยอดและรายละเอียดในใบด้านล่าง</li><li>โอนเงินให้ตรงตามยอดสุทธิ <b>{money(quote.rental + quote.deposit + quote.shipping)} บาท</b> ผ่าน QR หรือเลขบัญชีในใบ</li><li>ส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ {doc._id}</li></ol></section>}
        <div className="bill-actions">{settings.lineUrl && <a className="bill-button is-primary" href={settings.lineUrl} target="_blank" rel="noopener noreferrer">ส่งสลิป / ติดต่อร้านทาง LINE</a>}<PrintButton /></div>
        <p className="bill-meta">วันใช้งาน {dateLabel(doc.start)} – {dateLabel(doc.end)} · {doc.days} วัน</p>
        <div className="bill-paper"><RentalDocument row={doc} quote={quote} store={store} /></div>
      </>}
  </main>;
}

export default function Page({ params }: PageProps) {
  return <Suspense fallback={<main className="bill-page" role="status">กำลังโหลดบิล…</main>}><Content params={params} /></Suspense>;
}
