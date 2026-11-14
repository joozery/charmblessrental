import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getProductCategories, getProductColors, getProducts } from "@/lib/product-store";
import "./inventory.css";
import "./inventory-variants.css";
import "./inventory-variants-preview.css";
import AdminProducts from "./products-manager";
export const metadata = { title: "จัดการสินค้า | Charm Bless Admin", robots: { index: false, follow: false } };
async function Content() {
  await pageAdmin("products");
  const [products, categories, colors] = await Promise.all([getProducts(), getProductCategories(), getProductColors()]);
  return <AdminProducts initialProducts={products} initialCategories={categories} initialColors={colors} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดหลังบ้าน…</main>}><Content /></Suspense>; }
