import { createHmac, timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { adminAccounts, type PublicAdmin } from "./admin-accounts";
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
