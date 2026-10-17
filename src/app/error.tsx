"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ padding: "80px 24px", textAlign: "center" }}><h1>โหลดข้อมูลไม่สำเร็จ</h1><p>กรุณาลองอีกครั้ง หรือตรวจสอบการเชื่อมต่อฐานข้อมูล</p><button onClick={reset} style={{ padding: "10px 20px", marginTop: 20, borderRadius: 8, background: "#a85f78", color: "white", cursor: "pointer" }}>ลองอีกครั้ง</button></main>;
}
