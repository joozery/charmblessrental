import { createHmac, timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAccounts, type PublicAdmin } from "./admin-accounts";
import { can, type Permission } from "./permissions";
export function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function sign(value: string) { return createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(value).digest("hex"); }
export function configured() { return (process.env.ADMIN_SESSION_SECRET?.length || 0) >= 32 && !!process.env.MONGODB_URI; }
export function sessionToken(account: { _id: string; version: number }) {
  const payload = Buffer.from(JSON.stringify({ id: account._id, version: account.version, expires: Date.now() + 28800000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export async function currentAdmin(): Promise<PublicAdmin | null> {
  await connection();
  if (!configured()) return null;
  const token = (await cookies()).get("admin_session")?.value || "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !equal(signature, sign(payload))) return null;
  let value;
  try { value = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
  if (typeof value.id !== "string" || !Number.isInteger(value.version) || typeof value.expires !== "number" || value.expires <= Date.now()) return null;
  return (await adminAccounts()).findOne({ _id: value.id, version: value.version, active: true }, { projection: { passwordHash: 0 } });
}
export async function isAdmin() { return !!await currentAdmin(); }
export function sameOrigin(request: Request) { return request.headers.get("origin") === new URL(request.url).origin; }
// Route handlers: returns the admin, or the 401/403 response to send back.
export async function requireAdmin(permission?: Permission | "owner") {
  const admin = await currentAdmin();
  if (!admin) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) } as const;
  if (permission && !(permission === "owner" ? admin.role === "owner" : can(admin, permission))) return { error: Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อเจ้าของร้าน" }, { status: 403 }) } as const;
  return { admin } as const;
}
// Pages: sends signed-out visitors to login and accounts without the permission back to the dashboard.
export async function pageAdmin(permission?: Permission | "owner") {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  if (permission && !(permission === "owner" ? admin.role === "owner" : can(admin, permission))) redirect("/admin?denied=1");
  return admin;
}
