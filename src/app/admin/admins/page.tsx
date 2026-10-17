import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { listAdmins } from "@/lib/admin-accounts";
import AccountsManager from "./accounts-manager";
export const metadata = { title: "จัดการแอดมิน | Charm Bless", robots: { index: false, follow: false } };
async function Content() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "owner") redirect("/admin/products");
  const accounts = (await listAdmins()).map(a => ({ ...a, createdAt: a.createdAt.toISOString() }));
  return <AccountsManager initialAccounts={accounts} currentId={admin._id} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดบัญชีแอดมิน…</main>}><Content /></Suspense>; }
