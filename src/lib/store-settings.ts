import { database } from "@/lib/mongodb";
import type { ExtraDayRates, RentalPricing } from "@/lib/pricing";
import { defaultMessenger, type MessengerSettings } from "@/lib/delivery";
import type { FreeShipping, ShippingOption } from "@/lib/shipping";
import type { ScheduleSettings } from "@/lib/schedule";
import type { VerificationSettings } from "@/lib/identity";

export type StoreStep = { title: string; description: string };
// bank/accountName/accountNumber/qrImage are the account in use today, taken from `accounts` by day of the month
// (the shop may receive into one bank on the 1st–15th and another on the 16th–31st).
export type RentalDocumentDefaults = { deposit: number; bank: string; accountName: string; accountNumber: string; qrImage: string; returnAddress: string; returnPhone: string; returnMethod: string; accounts: ShopAccount[] };
export type StoreSettings = {
  logoImage: string; heroImage: string; heroTitle: string; heroSubtitle: string; promotionImage: string;
  howTitle: string; howSteps: StoreStep[]; contactTitle: string; contactDescription: string;
  footerTagline: string; lineUrl: string; instagramUrl: string; facebookUrl: string;
  shippingText: string; emsFee: number; rentalRules: string[]; rentalDocument: RentalDocumentDefaults; rentalPricing: RentalPricing; extraDayRates: ExtraDayRates; messenger: MessengerSettings; shippingOptions: ShippingOption[]; freeShipping: FreeShipping; schedule: ScheduleSettings; verification: VerificationSettings; lateRates: LateRates; categoryDeposits: CategoryDeposits;
};

export { defaultStoreSettings } from "@/lib/store-settings-defaults";
import { defaultStoreSettings } from "@/lib/store-settings-defaults";
import type { LateRates } from "@/lib/extension";
import type { CategoryDeposits } from "@/lib/pricing";
import { accountForDay, bankByCode, type ShopAccount } from "@/lib/banks";

const bangkokDayOfMonth = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", day: "2-digit" }).format(new Date()));
function withTodaysAccount(document: RentalDocumentDefaults): RentalDocumentDefaults {
  const account = accountForDay(document.accounts || [], bangkokDayOfMonth());
  return account ? { ...document, bank: bankByCode(account.bankCode)?.name || document.bank, accountName: account.accountName, accountNumber: account.accountNumber, qrImage: account.qrImage || document.qrImage } : document;
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const collection = (await database()).collection<StoreSettings & { _id: string }>("storeSettings");
  let stored = await collection.findOne({ _id: "main" }, { projection: { _id: 0 } });
  if (!stored) {
    await collection.updateOne({ _id: "main" }, { $setOnInsert: { ...defaultStoreSettings, _id: "main" } }, { upsert: true });
    stored = await collection.findOne({ _id: "main" }, { projection: { _id: 0 } });
  }
  return { ...defaultStoreSettings, ...(stored || {}), rentalDocument: withTodaysAccount({ ...defaultStoreSettings.rentalDocument, ...stored?.rentalDocument }), rentalPricing: stored?.rentalPricing || defaultStoreSettings.rentalPricing, extraDayRates: stored?.extraDayRates || defaultStoreSettings.extraDayRates, messenger: { ...defaultMessenger, ...stored?.messenger }, shippingOptions: (stored?.shippingOptions?.length ? stored.shippingOptions : defaultStoreSettings.shippingOptions).map(option => ({ ...option, leadDays: option.leadDays ?? 3 })), schedule: { ...defaultStoreSettings.schedule, ...stored?.schedule, gap: { ...defaultStoreSettings.schedule.gap, ...stored?.schedule?.gap } }, freeShipping: stored?.freeShipping || defaultStoreSettings.freeShipping, lateRates: { ...defaultStoreSettings.lateRates, ...stored?.lateRates }, categoryDeposits: stored?.categoryDeposits || {}, verification: { ...defaultStoreSettings.verification, ...stored?.verification, examples: { ...defaultStoreSettings.verification.examples, ...stored?.verification?.examples } } };
}
