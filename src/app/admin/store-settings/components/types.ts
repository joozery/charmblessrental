import type { StoreSettings } from "@/lib/store-settings";

export type ImageKey = "logoImage" | "heroImage" | "promotionImage";
export type SectionProps = { settings: StoreSettings; update: (patch: Partial<StoreSettings>) => void };
export type ImageSectionProps = SectionProps & { uploading: ImageKey | null; onUpload: (key: ImageKey, file?: File) => void };
