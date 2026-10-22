// Client-safe: renting without a security deposit by verifying identity (ID card + Instagram profile screenshot) instead.
// `examples` holds a sample picture per document (an image URL, "" for none) shown beside each upload box.
export type VerificationSettings = { enabled: boolean; maxRental: number | null; excludedCategories: string[]; validMonths: number; deleteAfterDays: number; note: string; examples: Record<IdentityFileKind, string> };
export const defaultVerification: VerificationSettings = {
  enabled: true, maxRental: null, excludedCategories: [], validMonths: 6, deleteAfterDays: 30,
  note: "ไม่ต้องวางเงินมัดจำ ส่งรูปบัตรประชาชน แคปหน้าโปรไฟล์ Instagram และที่อยู่ เพื่อยืนยันตัวตนแทน",
  examples: { idCard: "", instagram: "" },
};
export type VerificationStatus = "pending" | "submitted" | "approved" | "rejected";
export type BookingVerification = {
  mode: "identity"; status: VerificationStatus; profileId: string;
  submittedAt?: Date | string; reviewedAt?: Date | string; reviewedByName?: string; reason?: string; reused?: boolean; remindedAt?: Date | string;
};
export const verificationLabels: Record<VerificationStatus, string> = { pending: "รอลูกค้าส่งเอกสาร", submitted: "รอร้านตรวจเอกสาร", approved: "ยืนยันตัวตนแล้ว", rejected: "ขอเอกสารใหม่" };
export const identityFileKinds = [
  { key: "idCard", label: "รูปบัตรประชาชน (ด้านหน้า)", hint: "เบลอข้อมูลอื่นได้ทั้งหมด ยกเว้นชื่อ-นามสกุลและรูปหน้า เขียนกำกับว่า “ใช้เช่าชุด Charm Bless เท่านั้น”" },
  { key: "instagram", label: "แคปหน้าโปรไฟล์ Instagram (เต็มหน้าจอ)", hint: "แคปเต็มหน้าจอ ไม่ครอป ให้เห็นชื่อผู้ใช้ รูปโปรไฟล์ จำนวนโพสต์และผู้ติดตาม" },
] as const;
export type IdentityFileKind = typeof identityFileKinds[number]["key"];
// Files sent before the Instagram screenshot replaced the selfie keep their old kind until they are purged.
export const identityFileLabel = (kind: string) => identityFileKinds.find(item => item.key === kind)?.label ?? "เซลฟี่คู่บัตรประชาชน";
export const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^66/, "0");
// Shop rules: optional ceiling on the rental total and categories that always need a deposit (e.g. cameras).
export function identityAllowed(settings: VerificationSettings, rentalTotal: number | null, categories: string[]) {
  if (!settings.enabled) return false;
  if (settings.maxRental !== null && (rentalTotal === null || rentalTotal > settings.maxRental)) return false;
  return !categories.some(category => settings.excludedCategories.includes(category));
}
export function validVerificationSettings(value: unknown): value is VerificationSettings {
  const v = value as VerificationSettings | null;
  return !!v && typeof v.enabled === "boolean" && (v.maxRental === null || (Number.isFinite(v.maxRental) && v.maxRental >= 0 && v.maxRental <= 1000000))
    && Array.isArray(v.excludedCategories) && v.excludedCategories.length <= 50 && v.excludedCategories.every(item => typeof item === "string" && item.length > 0 && item.length <= 60)
    && Number.isSafeInteger(v.validMonths) && v.validMonths >= 0 && v.validMonths <= 36 && Number.isSafeInteger(v.deleteAfterDays) && v.deleteAfterDays >= 1 && v.deleteAfterDays <= 365
    && typeof v.note === "string" && v.note.length <= 500
    && !!v.examples && identityFileKinds.every(kind => typeof v.examples[kind.key] === "string" && (v.examples[kind.key] === "" || /^https:\/\/\S{1,500}$/.test(v.examples[kind.key])));
}
