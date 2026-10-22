// Client-safe: renting without a security deposit by verifying identity (ID card + selfie) instead.
export type VerificationSettings = { enabled: boolean; maxRental: number | null; excludedCategories: string[]; validMonths: number; deleteAfterDays: number; note: string };
export const defaultVerification: VerificationSettings = {
  enabled: true, maxRental: null, excludedCategories: [], validMonths: 6, deleteAfterDays: 30,
  note: "ไม่ต้องวางเงินประกัน ส่งรูปบัตรประชาชน เซลฟี่คู่บัตร และที่อยู่ เพื่อยืนยันตัวตนแทน",
};
export type VerificationStatus = "pending" | "submitted" | "approved" | "rejected";
export type BookingVerification = {
  mode: "identity"; status: VerificationStatus; profileId: string;
  submittedAt?: Date | string; reviewedAt?: Date | string; reviewedByName?: string; reason?: string; reused?: boolean; remindedAt?: Date | string;
};
export const verificationLabels: Record<VerificationStatus, string> = { pending: "รอลูกค้าส่งเอกสาร", submitted: "รอร้านตรวจเอกสาร", approved: "ยืนยันตัวตนแล้ว", rejected: "ขอเอกสารใหม่" };
export const identityFileKinds = [{ key: "idCard", label: "รูปบัตรประชาชน (ด้านหน้า)" }, { key: "selfie", label: "เซลฟี่คู่บัตรประชาชน" }] as const;
export type IdentityFileKind = typeof identityFileKinds[number]["key"];
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
    && typeof v.note === "string" && v.note.length <= 500;
}
