import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { permissionsOf } from "@/lib/permissions";
import { listAdmins } from "@/lib/admin-accounts";
import AccountsManager from "./accounts-manager";
export const metadata = { title: "จัดการแอดมิน | Charm Bless", robots: { index: false, follow: false } };
async function Content() {
  const admin = await pageAdmin("owner");
  const accounts = (await listAdmins()).map(a => ({ ...a, permissions: permissionsOf(a), createdAt: a.createdAt.toISOString() }));
  return <AccountsManager initialAccounts={accounts} currentId={admin._id} />;
}
export default function Page() { return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดบัญชีแอดมิน…</main>}><Content /></Suspense>; }
