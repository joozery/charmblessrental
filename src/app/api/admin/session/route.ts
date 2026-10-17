import { cookies } from "next/headers";
import { configured, sameOrigin, sessionToken } from "@/lib/admin-auth";
import { adminAccounts, hashPassword, verifyPassword } from "@/lib/admin-accounts";
const attempts = new Map<string, { count: number; until: number }>();
let dummyHash: Promise<string> | undefined;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  if (!configured()) return Response.json({ error: "กรุณาตั้งค่า MONGODB_URI และ ADMIN_SESSION_SECRET ใน .env.local" }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (typeof body?.email !== "string" || body.email.trim().length > 254 || !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || /^[a-zA-Z0-9._-]{3,40}$/.test(body.email.trim())) || typeof body.password !== "string" || !body.password || body.password.length > 128) return Response.json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  const email = body.email.trim().toLowerCase();
  for (const [key, entry] of attempts) if (entry.until <= Date.now()) attempts.delete(key);
  const attempt = attempts.get(email);
  if (attempt && attempt.count >= 10) return Response.json({ error: "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที" }, { status: 429 });
  if (attempts.size >= 10000 && !attempt) return Response.json({ error: "กรุณาลองใหม่ภายหลัง" }, { status: 429 });
  attempts.set(email, { count: (attempt?.count || 0) + 1, until: attempt?.until || Date.now() + 900000 });
  try {
    const collection = await adminAccounts();
    const account = email.includes("@")
      ? await collection.findOne({ email })
      : await collection.findOne({ username: email, $or: [{ email: { $exists: false } }, { email: "" }] });
    dummyHash ??= hashPassword("invalid-login-placeholder");
    const valid = await verifyPassword(body.password, account?.passwordHash || await dummyHash);
    if (!account || !account.active || !valid) return Response.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    attempts.delete(email);
    (await cookies()).set("admin_session", sessionToken(account), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 28800 });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "เชื่อมต่อระบบบัญชีไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 }); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  (await cookies()).delete("admin_session");
  return Response.json({ ok: true });
}
