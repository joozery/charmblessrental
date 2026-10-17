import { Suspense } from "react";
import { currentAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import AdminChrome from "./admin-chrome";
import "./admin.css";
import "./admin-chrome.css";
async function Workspace({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) return children;
  const db = await database();
  const [products, admins] = await Promise.all([
    db.collection("products").countDocuments(),
    admin.role === "owner" ? db.collection("admins").countDocuments() : Promise.resolve(0),
  ]);
  return <AdminChrome user={{ name: admin.name, email: admin.email, username: admin.username, role: admin.role }} counts={{ products, admins }}>{children}</AdminChrome>;
}
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดพื้นที่จัดการร้าน…</main>}><Workspace>{children}</Workspace></Suspense>;
}
