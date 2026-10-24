import "../../../bill/[token]/bill.css";
import "../../bookings/bookings.css";
import PrintButton from "../../../bill/[token]/print-button";

export default function LinePreviewBillPage() {
  return <main className="bill-page">
    <header className="bill-head"><div><span>CHARM BLESS RENTAL</span><h1>ใบรายละเอียดการเช่า</h1><p>เลขที่คำขอ BR-20261025-BB68F2</p></div><strong className="bill-status">รอชำระเงิน</strong></header>
    <section className="bill-track"><h2>สถานะการเช่า</h2><ol className="bill-steps"><li className="is-done"><span>1</span>รับคำขอ</li><li className="is-done"><span>2</span>ตรวจสอบคิว</li><li className="is-done"><span>3</span>รอชำระเงิน</li><li><span>4</span>เตรียมสินค้า</li><li><span>5</span>จัดส่ง</li></ol></section>
    <section className="bill-pay"><strong>วิธีชำระเงิน</strong><ol><li>ตรวจสอบยอดและรายละเอียดในใบด้านล่าง</li><li>โอนเงินให้ตรงตามยอดที่ต้องชำระ <b>1,150 บาท</b> ผ่าน QR หรือเลขบัญชีในใบ</li><li>ส่งสลิปให้ร้านทาง LINE พร้อมเลขที่คำขอ BR-20261025-BB68F2</li></ol></section>
    <div className="bill-actions"><a className="bill-button is-primary" href="https://line.me" target="_blank" rel="noreferrer">ส่งสลิป / ติดต่อร้านทาง LINE</a><PrintButton /></div>
    <p className="bill-meta">วันใช้งาน 27 ต.ค. 2569 – 9 พ.ย. 2569 · 14 วัน</p>
    <div className="bill-paper"><article className="rental-paper">
      <header className="rental-paper-brand"><div className="rental-paper-wordmark"><span><strong>CHARM BLESS <i>Rental</i></strong><small>CLOTHES FOR SPECIAL MOMENTS</small></span></div><div className="rental-paper-title"><strong>ใบรายละเอียดการเช่า</strong><small>RENTAL DETAILS</small></div></header>
      <div className="rental-paper-columns"><section className="rental-paper-section"><h3>ข้อมูลลูกค้า</h3><p><b>ชื่อ–นามสกุลผู้เช่า</b><span>ลูกค้าตัวอย่าง</span></p><p><b>เบอร์โทรศัพท์</b><span>08X-XXX-XXXX</span></p><p><b>ที่อยู่สำหรับจัดส่ง</b><span>รับเองที่ร้าน / ที่อยู่ตัวอย่าง</span></p></section><section className="rental-paper-section"><h3>ข้อมูลการเช่า</h3><p><b>วันที่จอง</b><span>25 ต.ค. 2569</span></p><p><b>กำหนดคืน</b><span>9 พ.ย. 2569</span></p><p><b>วันใช้งาน</b><span>27 ต.ค. – 9 พ.ย. 2569</span></p><p><b>ระยะเวลาเช่า</b><span>14 วัน</span></p></section></div>
      <section className="rental-paper-section rental-paper-items"><h3>รายการสินค้าเช่า</h3><table><thead><tr><th>ลำดับ</th><th>รูป</th><th>รหัสสินค้า / รายการ</th><th>จำนวน</th><th>ราคาเช่า (บาท)</th></tr></thead><tbody><tr><td>1</td><td><img src="/images/rose-dress.png" alt="" /></td><td><b>BR-DRESS-01</b><span>Tongjiu</span></td><td>1</td><td>1,100</td></tr></tbody></table></section>
      <div className="rental-paper-columns rental-paper-payment-row"><section className="rental-paper-section rental-paper-total"><h3>สรุปยอดค่าเช่า</h3><p><span>ค่าเช่ารวม</span><b>1,100</b></p><p><span>เงินมัดจำ (ยืนยันตัวตนแทน)</span><b>0</b></p><p><span>ค่าจัดส่ง</span><b>50</b></p><strong><span>ยอดรวมสุทธิ</span><b>1,150 บาท</b></strong></section><section className="rental-paper-section rental-paper-bank"><h3>ช่องทางชำระเงิน</h3><div><span className="rental-paper-qr">QR<br />ชำระเงิน</span><p><b>ข้อมูลบัญชีร้าน</b><span>ธนาคาร　:　กรอกชื่อธนาคาร</span><span>เลขที่บัญชี　:　กรอกเลขบัญชี</span><span>ชื่อบัญชี　:　กรอกชื่อบัญชี</span></p></div><small>ตรวจสอบยอดและบัญชีก่อนโอน</small></section></div>
      <div className="rental-paper-reminder"><strong>ส่งคืนภายในวันที่กำหนด 9 พ.ย. 2569 ก่อน 14:00 น.</strong></div>
      <section className="rental-paper-section rental-paper-return"><h3>ข้อมูลสำหรับส่งคืน</h3><div><strong>CHARM BLESS Rental</strong><span>ที่อยู่ส่งคืน　:　ติดต่อร้านเพื่อขอที่อยู่ส่งคืน</span><span>เบอร์โทรศัพท์　:　ติดต่อร้านทาง LINE</span><span>วิธีส่งคืน　:　ไปรษณีย์ / Flash / KEX</span></div></section>
      <footer className="rental-paper-social"><span>◎ @rental.charmbless</span><small>โปรดตรวจสอบข้อมูลก่อนชำระเงิน</small></footer>
    </article></div>
  </main>;
}
