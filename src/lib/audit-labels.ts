// Client-safe display names for audit log actions and changed fields.
export const actionLabels: Record<string, { label: string; group: string }> = {
  "auth.login": { label: "เข้าสู่ระบบ", group: "auth" },
  "auth.login_failed": { label: "เข้าสู่ระบบไม่สำเร็จ", group: "auth" },
  "auth.logout": { label: "ออกจากระบบ", group: "auth" },
  "booking.status": { label: "เปลี่ยนสถานะคำขอ", group: "bookings" },
  "booking.quote": { label: "แก้ไขราคา", group: "bookings" },
  "booking.bill_sent": { label: "ส่งบิลทาง LINE", group: "bookings" },
  "booking.payment_confirmed": { label: "ยืนยันชำระเงิน", group: "finance" },
  "booking.payment_reverted": { label: "ยกเลิกสถานะชำระ", group: "finance" },
  "booking.shipped": { label: "บันทึกเลขพัสดุ / ส่งมอบ", group: "bookings" },
  "booking.returned": { label: "รับคืนสินค้า", group: "bookings" },
  "deposit.refund": { label: "คืนเงินประกัน", group: "finance" },
  "finance.create": { label: "บันทึกรายรับ–รายจ่าย", group: "finance" },
  "finance.void": { label: "ยกเลิกรายการเงิน", group: "finance" },
  "product.create": { label: "เพิ่มสินค้า", group: "products" },
  "product.update": { label: "แก้ไขสินค้า", group: "products" },
  "product.price": { label: "แก้ไขราคาสินค้า", group: "products" },
  "product.restock": { label: "เติมสต๊อก", group: "products" },
  "product.unit": { label: "แก้ไขชิ้นสินค้า", group: "products" },
  "availability.update": { label: "ปรับคิวว่าง", group: "products" },
  "settings.store": { label: "ตั้งค่าหน้าร้าน", group: "settings" },
  "settings.rental_document": { label: "ตั้งค่าใบรายละเอียดการเช่า", group: "settings" },
  "admin.create": { label: "เพิ่มบัญชีแอดมิน", group: "admins" },
  "admin.update": { label: "แก้ไขบัญชีแอดมิน", group: "admins" },
};
export const actionGroups = [
  { key: "auth", label: "เข้า–ออกระบบ" }, { key: "bookings", label: "คำขอจอง" }, { key: "finance", label: "การเงิน" },
  { key: "products", label: "สินค้า" }, { key: "settings", label: "ตั้งค่า" }, { key: "admins", label: "บัญชีแอดมิน" },
];
export const fieldLabels: Record<string, string> = {
  status: "สถานะ", payment: "การชำระเงิน", paidOn: "วันที่ชำระ", rental: "ค่าเช่า", deposit: "เงินประกัน", shipping: "ค่าจัดส่ง",
  bank: "ธนาคาร", accountName: "ชื่อบัญชี", accountNumber: "เลขบัญชี", qrImage: "รูป QR", returnAddress: "ที่อยู่ส่งคืน", returnPhone: "เบอร์ร้าน", returnMethod: "วิธีส่งคืน",
  carrier: "ขนส่ง", trackingNumber: "เลขพัสดุ", condition: "สภาพสินค้า", note: "หมายเหตุ",
  depositStatus: "สถานะเงินประกัน", refundAmount: "ยอดคืน", deducted: "ยอดหัก", amount: "จำนวนเงิน", category: "หมวดหมู่", date: "วันที่", voided: "เหตุผลที่ยกเลิก",
  name: "ชื่อ", sku: "รหัสสินค้า", color: "สี", size: "ไซซ์", dailyRate: "ราคาเช่า", cost: "ต้นทุน", stock: "จำนวน", active: "แสดงหน้าร้าน", description: "รายละเอียด", images: "รูปสินค้า",
  email: "อีเมล", permissions: "สิทธิ์", password: "รหัสผ่าน", emsFee: "ค่าส่ง EMS",
};
export const valueLabels: Record<string, string> = {
  new: "ใหม่", contacted: "ติดต่อแล้ว", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก", paid: "ชำระแล้ว", unpaid: "รอชำระ",
  available: "พร้อมเช่า", unavailable: "ไม่พร้อมเช่า", retired: "เลิกใช้แล้ว", held: "ถือไว้", refunded: "คืนเต็มจำนวน", partial: "คืนบางส่วน", forfeited: "ยึดทั้งหมด", good: "สภาพปกติ", damaged: "ชำรุด", missing: "สูญหาย/ไม่ครบ", true: "ใช่", false: "ไม่ใช่",
};
export const showValue = (value: unknown) => value === null || value === undefined || value === "" ? "—" : Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : valueLabels[String(value)] || String(value);
