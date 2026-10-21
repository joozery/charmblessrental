// Client-safe: used by server guards and by the admin UI to hide what an account cannot do.
export const permissionList = [
  { key: "bookings", label: "คำขอจอง", description: "ดูคำขอ เปลี่ยนสถานะ และส่งบิล" },
  { key: "pricing", label: "แก้ไขราคาในใบสรุป", description: "ค่าเช่า เงินประกัน และค่าจัดส่ง" },
  { key: "payments", label: "ยืนยันการชำระเงิน", description: "บันทึกรับเงินค่าเช่าและเงินประกัน" },
  { key: "shipping", label: "จัดส่งและรับคืน", description: "บันทึกเลขพัสดุและรับคืนสินค้า" },
  { key: "deposits", label: "คืนเงินประกัน", description: "คืนเงิน หักเงิน และแนบหลักฐาน" },
  { key: "finance", label: "การเงิน", description: "ดูสรุปและบันทึกรายรับ–รายจ่าย" },
  { key: "rentals", label: "ประวัติการเช่า", description: "ค้นหารายการเช่าเดิม" },
  { key: "products", label: "สินค้าและคิวว่าง", description: "แก้ไขสินค้า ราคา และจำนวนว่าง" },
  { key: "settings", label: "ตั้งค่าร้าน", description: "หน้าร้านและใบรายละเอียดการเช่า" },
  { key: "activity", label: "ประวัติการทำรายการ", description: "ดูว่าใครทำอะไร เมื่อใด" },
] as const;
export type Permission = typeof permissionList[number]["key"];
export const allPermissions = permissionList.map(item => item.key) as Permission[];
export const permissionPresets: { label: string; permissions: Permission[] }[] = [
  { label: "ฝ่ายสินค้า", permissions: ["products"] },
  { label: "ฝ่ายจองและจัดส่ง", permissions: ["bookings", "shipping", "rentals", "products"] },
  { label: "ฝ่ายการเงิน", permissions: ["bookings", "pricing", "payments", "deposits", "finance", "rentals"] },
  { label: "ผู้จัดการ (ทุกเมนู)", permissions: allPermissions },
];
export const isPermission = (value: unknown): value is Permission => typeof value === "string" && (allPermissions as string[]).includes(value);
// Accounts created before permissions existed keep full access until the owner narrows them.
export function permissionsOf(account: { role: "owner" | "admin"; permissions?: Permission[] }) {
  return account.role === "owner" || !account.permissions ? allPermissions : account.permissions.filter(isPermission);
}
export const can = (account: { role: "owner" | "admin"; permissions?: Permission[] }, permission: Permission) => permissionsOf(account).includes(permission);
