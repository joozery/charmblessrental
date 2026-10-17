import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/product-store";
import "./inventory.css";
import AdminProducts from "./products-manager";
export const metadata = { title: "จัดการสินค้า | Charm Bless Admin", robots: { index: false, follow: false } };
async function Content() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return <AdminProducts initialProducts={await getProducts()} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดหลังบ้าน…</main>}><Content /></Suspense>; }
