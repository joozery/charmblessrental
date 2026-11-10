import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { mapsConfigured } from "@/lib/delivery-quote";
import { getStoreSettings } from "@/lib/store-settings";
import { database } from "@/lib/mongodb";
import DeliverySettings from "./delivery-settings";
import "../rental-pricing/rental-pricing.css";

export const metadata = { title: "ค่าจัดส่ง | Charm Bless", robots: { index: false, follow: false } };

async function Content() {
  await pageAdmin("settings");
  const settings = await getStoreSettings();
  const categories = await (await database()).collection<{ category?: string }>("products").distinct("category", { active: { $ne: false }, category: { $type: "string" } });
  return <DeliverySettings initial={settings.messenger} shipping={{ options: settings.shippingOptions, free: settings.freeShipping, schedule: settings.schedule, categoryRules: settings.categoryShippingRules }} categories={categories.filter((category): category is string => typeof category === "string" && category.length > 0).sort()} mapsReady={mapsConfigured()} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดค่าจัดส่ง…</main>}><Content /></Suspense>;
}
