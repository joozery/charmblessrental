import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { mapsConfigured } from "@/lib/delivery-quote";
import { getStoreSettings } from "@/lib/store-settings";
import DeliverySettings from "./delivery-settings";
import "../rental-pricing/rental-pricing.css";

export const metadata = { title: "ค่าจัดส่ง | Charm Bless", robots: { index: false, follow: false } };

async function Content() {
  await pageAdmin("settings");
  const settings = await getStoreSettings();
  return <DeliverySettings initial={settings.messenger} emsFee={settings.emsFee} mapsReady={mapsConfigured()} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดค่าจัดส่ง…</main>}><Content /></Suspense>;
}
