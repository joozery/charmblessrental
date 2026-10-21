import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getStoreSettings } from "@/lib/store-settings";
import SettingsManager from "./settings-manager";
import "./store-settings.css";

export const metadata = { title: "ตั้งค่าหน้าร้าน | Charm Bless", robots: { index: false, follow: false } };
async function Content() {
  await pageAdmin("settings");
  return <SettingsManager initial={await getStoreSettings()} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดการตั้งค่าหน้าร้าน…</main>}><Content /></Suspense>; }
