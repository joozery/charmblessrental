"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";

export default function BookingModifyPanel({ row }: { row: { _id: string; status: string; shipment?: unknown; returned?: unknown } }) {
  const router = useRouter();
  const editable = row.status !== "cancelled" && !row.shipment && !row.returned;
  return <div className="bookings-detail-section bookings-modify"><Icon name="booking" /><div><div className="bookings-modify-heading"><div><h3>แก้ไขรายการทั้งหมด</h3><p>เปิดฟอร์มเดียวกับการเพิ่มรายการ เพื่อแก้ไขข้อมูลเดิมให้ครบทุกส่วน</p></div>{editable && <button type="button" className="bookings-modify-open" onClick={() => router.push(`/admin/bookings/edit/${encodeURIComponent(row._id)}`)}>แก้ไขรายการทั้งหมด</button>}</div>{!editable && <p className="bookings-fulfillment-meta">รายการนี้จัดส่งหรือปิดงานแล้ว จึงแก้ไขรายการทั้งหมดไม่ได้</p>}</div></div>;
}
