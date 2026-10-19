import { Suspense } from "react";
import { notFound } from "next/navigation";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import { RentalDocument, dateLabel, money, quoteForRow, type DocRow } from "@/components/rental-document";
import PrintButton from "./print-button";
import "@/app/admin/bookings/bookings.css";
import "./bill.css";

export const metadata = { title: "ใบรายละเอียดการเช่า | Charm Bless", robots: { index: false, follow: false } };
type BillDoc = Omit<DocRow, "createdAt"> & { status: string; payment?: "unpaid" | "paid"; billToken: string; createdAt: Date };
type PageProps = { params: Promise<{ token: string }> };

async function Content({ params }: PageProps) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const row = await (await database()).collection<BillDoc>("bookingRequests").findOne({ billToken: token }, { projection: { _id: 1, status: 1, payment: 1, name: 1, phone: 1, address: 1, start: 1, end: 1, days: 1, deliveryFee: 1, quote: 1, items: 1, createdAt: 1 } });
  if (!row) notFound();
  const settings = await getStoreSettings();
  const doc: DocRow = { ...row, _id: String(row._id), createdAt: new Date(row.createdAt).toISOString() };
  const store = { logoImage: settings.logoImage, lineUrl: settings.lineUrl, instagramUrl: settings.instagramUrl, rentalRules: settings.rentalRules, rentalDocument: settings.rentalDocument };
  const quote = quoteForRow(doc, settings.rentalDocument);
  const paid = row.payment === "paid";
  return <main className="bill-page">
    <header className="bill-head"><div><span>CHARM BLESS RENTAL</span><h1>ใบรายละเอียดการเช่า</h1><p>เลขที่คำขอ {doc._id}</p></div>{row.status !== "cancelled" && row.quote && <strong className={paid ? "bill-status is-paid" : "bill-status"}>{paid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</strong>}</header>
    {row.status === "cancelled" ? <p className="bill-notice">คำขอนี้ถูกยกเลิกแล้ว หากมีข้อสงสัยกรุณาติดต่อร้านทาง LINE</p>
      : !row.quote ? <p className="bill-notice">ร้านกำลังจัดทำบิลของคุณ กรุณารอสักครู่ หรือติดต่อร้านทาง LINE</p>
      : <>
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
