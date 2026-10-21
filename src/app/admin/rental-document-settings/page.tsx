import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getStoreSettings } from "@/lib/store-settings";
import RentalDocumentSettings from "./rental-document-settings";
import "./rental-document-settings.css";

export const metadata = { title: "ตั้งค่าใบรายละเอียดการเช่า | Charm Bless", robots: { index: false, follow: false } };

async function Content() {
  await pageAdmin("settings");
  const settings = await getStoreSettings();
  return <RentalDocumentSettings initial={settings.rentalDocument} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดการตั้งค่าใบรายละเอียดการเช่า…</main>}><Content /></Suspense>;
}
