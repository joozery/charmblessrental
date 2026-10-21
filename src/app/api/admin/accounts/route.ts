import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { adminAccounts, createAdmin, hashPassword, listAdmins } from "@/lib/admin-accounts";
import { audit, diff } from "@/lib/audit";
import { isPermission, permissionsOf, type Permission } from "@/lib/permissions";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("owner");
  if (auth.error) return auth.error.status === 403 ? Response.json({ error: "เฉพาะเจ้าของร้านที่จัดการบัญชีแอดมินได้" }, { status: 403 }) : auth.error;
  const actor = auth.admin;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.trim().length > 254 || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || typeof body.active !== "boolean" || typeof body.password !== "string" || ((body.password || !body.id) && (body.password.length < 8 || body.password.length > 128)) || (body.id !== undefined && (typeof body.id !== "string" || body.id.length > 100))) return Response.json({ error: "กรุณากรอกอีเมลที่ถูกต้อง และตั้งรหัสผ่าน 8–128 ตัวอักษร" }, { status: 400 });
  if (!Array.isArray(body.permissions) || body.permissions.length > 20 || !body.permissions.every(isPermission)) return Response.json({ error: "สิทธิ์การใช้งานไม่ถูกต้อง" }, { status: 400 });
  const permissions: Permission[] = [...new Set<Permission>(body.permissions)];
  try {
    const email = body.email.trim().toLowerCase();
    const collection = await adminAccounts();
    if (body.id) {
      const target = await collection.findOne({ _id: body.id });
      if (!target) return Response.json({ error: "ไม่พบบัญชีแอดมิน" }, { status: 404 });
      if (target.role === "owner" && !body.active) return Response.json({ error: "ไม่สามารถปิดใช้งานบัญชีเจ้าของร้านได้" }, { status: 400 });
      const passwordHash = body.password ? await hashPassword(body.password) : undefined;
      const next = { email, name: body.name.trim(), active: body.active, ...(target.role === "owner" ? {} : { permissions }) };
      await collection.updateOne({ _id: target._id }, { $set: { ...next, ...(passwordHash ? { passwordHash } : {}) }, $inc: { version: 1 } });
      const changes = diff({ ...target, permissions: permissionsOf(target) }, next);
      if (passwordHash) changes.push({ field: "password", before: "••••", after: "เปลี่ยนรหัสผ่าน" });
      await audit(request, actor, { action: "admin.update", targetType: "admin", targetId: target._id, summary: `แก้ไขบัญชีแอดมิน ${next.name}`, changes });
    } else {
      const id = await createAdmin({ email, name: body.name.trim(), password: body.password, active: body.active, permissions });
      await audit(request, actor, { action: "admin.create", targetType: "admin", targetId: id, summary: `เพิ่มบัญชีแอดมิน ${body.name.trim()}`, changes: diff(null, { email, name: body.name.trim(), active: body.active, permissions }) });
    }
    return Response.json({ accounts: await listAdmins() });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return Response.json({ error: "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว" }, { status: 409 });
    return Response.json({ error: "บันทึกบัญชีไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
