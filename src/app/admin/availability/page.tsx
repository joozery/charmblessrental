import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/product-store";
import AvailabilityManager from "./availability-manager";
import "./availability.css";

export const metadata = { title: "คิวชุดและวันปิดรับ | Charm Bless", robots: { index: false, follow: false } };
async function Content() {
  await pageAdmin("products");
  const products = (await getProducts()).map(product => ({ id: product.id, name: product.name, sku: product.sku }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <AvailabilityManager products={products} initialMonth={today.slice(0, 7)} today={today} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดคิวสินค้า…</main>}><Content /></Suspense>; }
