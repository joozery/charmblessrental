import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/product-store";
import "./inventory.css";
import AdminProducts from "./products-manager";
export const metadata = { title: "จัดการสินค้า | Charm Bless Admin", robots: { index: false, follow: false } };
async function Content() {
  await pageAdmin("products");
  return <AdminProducts initialProducts={await getProducts()} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดหลังบ้าน…</main>}><Content /></Suspense>; }
