import { Suspense } from "react";
import { redirect } from "next/navigation";
import { configured, isAdmin } from "@/lib/admin-auth";
import LoginForm from "./login-form";
export const metadata = { title: "เข้าสู่ระบบ | Charm Bless Admin", robots: { index: false, follow: false } };
async function Content() {
  if (await isAdmin()) redirect("/admin");
  return <LoginForm configured={configured()} />;
}
export default function LoginPage() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลด…</main>}><Content /></Suspense>;
}
