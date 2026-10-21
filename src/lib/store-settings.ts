import { database } from "@/lib/mongodb";
import type { RentalPricing } from "@/lib/pricing";
import { defaultMessenger, type MessengerSettings } from "@/lib/delivery";

export type StoreStep = { title: string; description: string };
export type RentalDocumentDefaults = { deposit: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string };
export type StoreSettings = {
  logoImage: string; heroImage: string; heroTitle: string; heroSubtitle: string; promotionImage: string;
  howTitle: string; howSteps: StoreStep[]; contactTitle: string; contactDescription: string;
  footerTagline: string; lineUrl: string; instagramUrl: string; facebookUrl: string;
  shippingText: string; emsFee: number; rentalRules: string[]; rentalDocument: RentalDocumentDefaults; rentalPricing: RentalPricing; messenger: MessengerSettings;
};

export { defaultStoreSettings } from "@/lib/store-settings-defaults";
import { defaultStoreSettings } from "@/lib/store-settings-defaults";

export async function getStoreSettings(): Promise<StoreSettings> {
  const collection = (await database()).collection<StoreSettings & { _id: string }>("storeSettings");
  let stored = await collection.findOne({ _id: "main" }, { projection: { _id: 0 } });
  if (!stored) {
    await collection.updateOne({ _id: "main" }, { $setOnInsert: { ...defaultStoreSettings, _id: "main" } }, { upsert: true });
    stored = await collection.findOne({ _id: "main" }, { projection: { _id: 0 } });
  }
  return { ...defaultStoreSettings, ...(stored || {}), rentalDocument: { ...defaultStoreSettings.rentalDocument, ...stored?.rentalDocument }, rentalPricing: stored?.rentalPricing || defaultStoreSettings.rentalPricing, messenger: { ...defaultMessenger, ...stored?.messenger } };
}
