"use client";

import { useMemo, useState } from "react";
import "./line-preview.css";

const sample = `ได้รับข้อมูลคำขอ BR-20261025-BB68F2 แล้วค่ะ
ร้านกำลังตรวจสอบคิวและจัดทำใบรายละเอียดการเช่า จะส่งลิงก์ชำระเงินให้โดยเร็วที่สุดนะคะ 💗

คำขอนี้เลือกแบบไม่วางเงินมัดจำ รบกวนยืนยันตัวตน (รูปบัตรประชาชน + แคปหน้า Instagram เต็มหน้าจอ + ที่อยู่) ก่อนวันจัดส่ง ใช้เวลาประมาณ 2 นาที 👉 https://charmblessrental.com/bill/CcyMVUZYQOWOjx1B9A690TWn`;

const presets = [
  { key: "request", label: "Request received", text: sample },
  { key: "bill", label: "Bill sent", text: "ใบรายละเอียดการเช่าพร้อมแล้วค่ะ\nกรุณาตรวจสอบยอดและโอนเงินตามยอดสุทธิ จากนั้นส่งสลิปในแชทนี้นะคะ\nดูบิลได้ที่ https://charmblessrental.com/bill/CcyMVUZYQOWOjx1B9A690TWn" },
  { key: "shipped", label: "Shipped", text: "จัดส่งคำขอ BR-20261025-BB68F2 แล้วค่ะ\nขนส่ง: Flash Express\nเลขพัสดุ: TH123456789\nกรุณาส่งคืนชุดภายใน 9 พ.ย. 2569\nดูรายละเอียดที่ https://charmblessrental.com/bill/CcyMVUZYQOWOjx1B9A690TWn" },
  { key: "returned", label: "Return reported", text: "ได้รับแจ้งส่งคืนชุดแล้วค่ะ\nคำขอ BR-20261025-BB68F2\nเลขพัสดุ: TH123456789\nร้านจะแจ้งอีกครั้งเมื่อได้รับสินค้าเรียบร้อยค่ะ" },
];

function IdentityPreview({ url }: { url?: string }) {
  return <div className="line-preview-identity">
    <div className="line-preview-identity-brand">Charmblessrental.</div>
    <h2>ยืนยันตัวตนก่อนเช่า</h2>
    <p>สำหรับลูกค้าที่เช่าแบบไม่วางเงินมัดจำ กรุณาเตรียมข้อมูลด้านล่างเพื่อดำเนินการต่อ ใช้เวลาประมาณ 2 นาที</p>
    <div className="line-preview-request-number"><span>หมายเลขคำขอ</span><strong>BR-20261025-BB68F2</strong></div>
    <div className="line-preview-checklist"><h3>สิ่งที่ต้องเตรียม</h3>{[["👤", "ชื่อ–นามสกุลผู้เช่า", "กรอกชื่อและนามสกุลของผู้เช่า"], ["🪪", "รูปบัตรประชาชน", "ใช้ภาพที่เห็นชื่อและรูปถ่ายชัดเจน สามารถปิดข้อมูลส่วนอื่นที่ไม่จำเป็นได้"], ["📷", "ภาพหน้าโปรไฟล์ Instagram", "แคปหน้าจอโปรไฟล์ให้เห็นชื่อบัญชีและหน้าโปรไฟล์เต็มหน้าจอ"], ["🏠", "ที่อยู่สำหรับจัดส่ง", "เตรียมที่อยู่และเบอร์โทรศัพท์สำหรับการจัดส่งสินค้า"]].map(([icon, title, detail]) => <div className="line-preview-check" key={title}><b>{icon}</b><span><strong>{title}</strong><small>{detail}</small></span></div>)}</div>
    {url && <a className="line-preview-button" href={url} target="_blank" rel="noreferrer">เริ่มยืนยันตัวตน →</a>}
    <small className="line-preview-privacy">ข้อมูลจะใช้สำหรับตรวจสอบตัวตนและดำเนินการเช่าตามนโยบายความเป็นส่วนตัวของร้าน</small>
  </div>;
}

function BillPreview({ url }: { url?: string }) {
  return <div className="line-preview-bill">
    <div className="line-preview-bill-brand">CHARM BLESS RENTAL</div>
    <h2>ใบรายละเอียดการเช่า</h2><span className="line-preview-bill-status">รอชำระเงิน</span>
    <p className="line-preview-bill-id">เลขที่คำขอ <b>BR-20261025-BB68F2</b></p>
    <img className="line-preview-bill-image" src="/images/rose-dress.png" alt="รูปชุดที่เช่า" />
    <div className="line-preview-bill-item"><span>ชุด</span><b>Tongjiu</b></div>
    <div className="line-preview-bill-item"><span>วันใช้งาน</span><b>27 ต.ค. 2569 – 9 พ.ย. 2569</b></div>
    <div className="line-preview-bill-total"><p><span>ค่าเช่ารวม</span><b>฿1,100</b></p><p><span>เงินมัดจำ</span><b>฿0</b></p><p><span>ค่าจัดส่ง</span><b>฿50</b></p><strong><span>ยอดรวมสุทธิ</span><b>฿1,150</b></strong></div>
    <div className="line-preview-bill-pay"><h3>ช่องทางชำระเงิน</h3><p>โอนเงินตามบัญชีร้านในบิล และส่งสลิปทาง LINE พร้อมเลขที่คำขอ</p></div>
    {url && <a className="line-preview-button" href={url} target="_blank" rel="noreferrer">เปิดบิลและแจ้งชำระเงิน</a>}
  </div>;
}

function ShippedPreview({ url }: { url?: string }) {
  const [copied, setCopied] = useState(false);
  const copyTracking = async () => { await navigator.clipboard.writeText("TH123456789"); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <div className="line-preview-shipped">
    <header><strong>Charmblessrental</strong><span>เช่าง่าย　สวยครบ　พร้อมส่งถึงมือคุณ</span><b>📦</b></header>
    <div className="line-preview-shipped-status"><strong>✓　จัดส่งคำขอแล้วค่ะ</strong><span>เลขคำขอ　BR-20261025-BB68F2</span><small>เรากำลังดำเนินการจัดส่งสินค้าของคุณ สามารถตรวจสอบสถานะได้ที่ลิงก์ด้านล่างค่ะ</small></div>
    <div className="line-preview-shipped-row"><i>🚚</i><span><b>ขนส่ง</b><strong>Flash Express</strong></span><em>FLASH<br /><small>EXPRESS</small></em></div>
    <div className="line-preview-shipped-row"><i>📄</i><span><b>เลขพัสดุ</b><strong>TH123456789</strong></span><button type="button" className="copy" aria-label="คัดลอกเลขพัสดุ" title="คัดลอกเลขพัสดุ" onClick={() => void copyTracking()}>{copied ? "✓" : "⧉"}</button></div>
    <div className="line-preview-shipped-row"><i>📅</i><span><b>คาดว่าจะถึง</b><strong>ภายใน 9 พ.ย. 2569</strong></span></div>
    {url && <a className="line-preview-shipped-button" href={url} target="_blank" rel="noreferrer">📄　เปิดรายละเอียด　→</a>}
  </div>;
}

function ReturnPreview() {
  return <div className="line-preview-return">
    <header><strong>Charmblessrental</strong><span>ได้รับแจ้งคืนชุดแล้วค่ะ</span></header>
    <div className="line-preview-return-body"><h2><b>📦↩</b> ได้รับแจ้งคืนชุดแล้วค่ะ</h2><div className="line-preview-return-box"><i>📄</i><span><small>คำขอ</small><strong>BR-20261025-BB68F2</strong></span></div><div className="line-preview-return-box"><i>📦</i><span><small>เลขพัสดุ:</small><strong>TH123456789</strong></span></div><div className="line-preview-return-note"><b>📣</b><span>ร้านจะแจ้งอีกครั้งเมื่อได้รับสินค้าที่เรียบร้อยค่ะ</span></div></div>
  </div>;
}

export default function LinePreviewPage() {
  const [message, setMessage] = useState(sample);
  const title = useMemo(() => message.split("\n").find(Boolean)?.replace(/[🎉✅📦💳📷🔍📝🌷🙏💗]/gu, "").trim() || "แจ้งเตือนจากร้าน", [message]);
  const url = message.match(/https?:\/\/[^\s)]+/)?.[0];
  const billPreviewUrl = message === presets[1].text ? "/admin/line-preview/bill" : url;

  return <main className="admin-main line-preview-page">
    <div className="admin-page-title">
      <div><p className="admin-eyebrow">LINE MESSAGE</p><h1>Preview Card</h1><p>ดูหน้าตาการ์ดก่อนส่งให้ลูกค้า โดยยังไม่ส่งข้อความจริง</p></div>
    </div>
    <div className="line-preview-grid">
      <section className="admin-catalog line-preview-editor">
        <div className="line-preview-presets">{presets.map(preset => <button key={preset.key} type="button" className={message === preset.text ? "is-active" : ""} onClick={() => setMessage(preset.text)}>{preset.label}</button>)}</div>
        <div className="admin-catalog-heading"><h2>ข้อความตัวอย่าง</h2><span className="admin-muted">แก้ไขแล้วดูผลได้ทันที</span></div>
        <textarea value={message} onChange={event => setMessage(event.target.value)} aria-label="ข้อความตัวอย่างสำหรับ Preview" />
      </section>
      <section className="line-preview-stage" aria-label="ตัวอย่าง LINE Card">
        <div className="line-preview-phone"><div className="line-preview-account">Charmblessrental</div><article className="line-preview-card">
          {message === sample ? <IdentityPreview url={url} /> : message === presets[1].text ? <BillPreview url={billPreviewUrl} /> : message === presets[2].text ? <ShippedPreview url={url} /> : message === presets[3].text ? <ReturnPreview /> : <>
          <header><strong>Charmblessrental</strong><span>{title.slice(0, 60)}</span></header>
          <div className="line-preview-body">{message || "พิมพ์ข้อความเพื่อดูตัวอย่าง"}</div>
          {url && <a className="line-preview-button" href={url} target="_blank" rel="noreferrer">เปิดรายละเอียด</a>}
          </>}</article></div>
      </section>
    </div>
  </main>;
}
