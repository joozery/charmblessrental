import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/product-store";
import AvailabilityManager from "./availability-manager";
import "./availability.css";

export const metadata = { title: "คิวชุดและวันปิดรับ | Charm Bless", robots: { index: false, follow: false } };
async function Content({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  await pageAdmin("products");
  const products = (await getProducts()).map(product => ({ id: product.id, name: product.name, sku: product.sku }));
  const query = await searchParams, requested = Number(query.productId), initialProductId = products.some(product => product.id === requested) ? requested : undefined;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <AvailabilityManager products={products} initialProductId={initialProductId} initialMonth={today.slice(0, 7)} today={today} />;
}
export default function Page({ searchParams }: { searchParams: Promise<{ productId?: string }> }) { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดคิวสินค้า…</main>}><Content searchParams={searchParams} /></Suspense>; }
