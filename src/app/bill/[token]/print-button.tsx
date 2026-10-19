"use client";

export default function PrintButton() {
  return <button type="button" className="bill-button" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>;
}
