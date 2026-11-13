export type RentalPhotoStage = "beforeShipment" | "received" | "return";
export type RentalPhoto = { url: string; stage: RentalPhotoStage; uploadedBy: "customer" | "admin" | "system"; uploadedAt: Date | string; condition?: "normal" | "damaged"; note?: string; source?: "manual" | "automatic" };
export type ReceivedCondition = { value: "normal" | "damaged"; at: Date | string; by: "customer" | "admin" | "system"; acknowledgedAt?: Date | string; acknowledgedBy?: string; note?: string };
export const photoLimit = 5 * 1024 * 1024;
export const validPhotoUrl = (value: unknown) => typeof value === "string" && /^https?:\/\/[^\s]+\/rental-photos\/[\w-]+\.(?:png|jpg|webp)$/.test(value);
export const receivedDeadline = (start: string) => new Date(`${start}T23:59:59.999+07:00`);
