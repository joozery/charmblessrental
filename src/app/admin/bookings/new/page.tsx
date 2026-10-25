import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/product-store";
import { getStoreSettings } from "@/lib/store-settings";
import { depositFor, effectivePricing } from "@/lib/pricing";
import NewBookingForm from "./new-booking-form";

async function Content() {
  await pageAdmin("bookings");
  const [products, settings] = await Promise.all([getProducts(), getStoreSettings()]);
  return <NewBookingForm products={products.filter(product => product.active !== false && (product.stock ?? 0) > 0).map(product => ({ id: product.id, name: product.thai || product.name, sku: product.sku || "", category: product.category, price: product.dailyRate, pricing: effectivePricing(product, settings.rentalPricing, settings.extraDayRates), deposit: depositFor(product, settings.categoryDeposits) || settings.rentalDocument.deposit, shippingFee: product.shippingFee ?? null, stock: product.stock ?? 0, gapDays: product.gapDays ?? null }))} methods={settings.shippingOptions.filter(option => option.enabled).map(option => ({ id: option.id, label: option.label, description: option.description, fee: option.fee, standard: option.standard }))} shipping={{ options: settings.shippingOptions, free: settings.freeShipping }} verification={settings.verification} messenger={{ enabled: settings.messenger.enabled, label: "แมสเซนเจอร์ (Grab / LINE MAN)", description: settings.messenger.description, inBill: settings.messenger.inBill }} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading">กำลังโหลดฟอร์มสร้างรายการใหม่…</main>}><Content /></Suspense>; }
