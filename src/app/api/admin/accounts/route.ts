import { currentAdmin, sameOrigin } from "@/lib/admin-auth";
import { adminAccounts, createAdmin, hashPassword, listAdmins } from "@/lib/admin-accounts";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const actor = await currentAdmin();
  if (!actor) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (actor.role !== "owner") return Response.json({ error: "เฉพาะเจ้าของร้านที่จัดการบัญชีแอดมินได้" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.trim().length > 254 || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || typeof body.active !== "boolean" || typeof body.password !== "string" || ((body.password || !body.id) && (body.password.length < 8 || body.password.length > 128)) || (body.id !== undefined && (typeof body.id !== "string" || body.id.length > 100))) return Response.json({ error: "กรุณากรอกอีเมลที่ถูกต้อง และตั้งรหัสผ่าน 8–128 ตัวอักษร" }, { status: 400 });
  try {
    const email = body.email.trim().toLowerCase();
    const collection = await adminAccounts();
    if (body.id) {
      const target = await collection.findOne({ _id: body.id });
      if (!target) return Response.json({ error: "ไม่พบบัญชีแอดมิน" }, { status: 404 });
      if (target.role === "owner" && !body.active) return Response.json({ error: "ไม่สามารถปิดใช้งานบัญชีเจ้าของร้านได้" }, { status: 400 });
      const passwordHash = body.password ? await hashPassword(body.password) : undefined;
      await collection.updateOne({ _id: target._id }, { $set: { email, name: body.name.trim(), active: body.active, ...(passwordHash ? { passwordHash } : {}) }, $inc: { version: 1 } });
    } else { await createAdmin({ email, name: body.name.trim(), password: body.password, active: body.active }); }
    return Response.json({ accounts: await listAdmins() });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return Response.json({ error: "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว" }, { status: 409 });
    return Response.json({ error: "บันทึกบัญชีไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
