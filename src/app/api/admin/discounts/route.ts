import { randomUUID } from "node:crypto";
import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { cleanCode, discountCoupons } from "@/lib/discounts";
import { database } from "@/lib/mongodb";

export async function GET() {
  const auth = await requireAdmin("pricing"); if (auth.error) return auth.error;
  return Response.json({ coupons: await discountCoupons(await database()).find({}).sort({ createdAt: -1 }).toArray() });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("pricing"); if (auth.error) return auth.error;
  const body = await request.json().catch(() => null), code = cleanCode(body?.code), percent = Number(body?.percent);
  if (!code || !/^[A-Z0-9_-]{3,30}$/.test(code) || typeof body?.label !== "string" || !body.label.trim() || !Number.isFinite(percent) || percent <= 0 || percent > 100 || (body.maxUses !== null && body.maxUses !== undefined && (!Number.isInteger(body.maxUses) || body.maxUses < 1)) || (body.startsAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.startsAt)) || (body.endsAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.endsAt))) return Response.json({ error: "กรุณาตรวจสอบโค้ด ชื่อ และเปอร์เซ็นต์ส่วนลด" }, { status: 400 });
  const db = await database(), now = new Date(), id = typeof body.id === "string" ? body.id : randomUUID();
  const value = { _id: id, code, label: body.label.trim().slice(0, 120), percent: Math.round(percent * 100) / 100, active: body.active !== false, startsAt: body.startsAt || undefined, endsAt: body.endsAt || undefined, maxUses: body.maxUses ?? null, usedCount: 0, createdAt: now, updatedAt: now };
  if (body.id) { const old = await discountCoupons(db).findOne({ _id: id }); if (!old) return Response.json({ error: "ไม่พบโค้ดส่วนลด" }, { status: 404 }); await discountCoupons(db).updateOne({ _id: id }, { $set: { code, label: value.label, percent: value.percent, active: value.active, startsAt: value.startsAt, endsAt: value.endsAt, maxUses: value.maxUses, updatedAt: now } }); }
  else { try { await discountCoupons(db).insertOne(value); } catch (error) { if ((error as { code?: number }).code === 11000) return Response.json({ error: "โค้ดนี้มีอยู่แล้ว" }, { status: 409 }); throw error; } }
  await audit(request, auth.admin, { action: "discount.coupon_saved", targetType: "settings", targetId: id, summary: `${body.id ? "แก้ไข" : "สร้าง"}โค้ดส่วนลด ${code} ${value.percent}%` });
  return Response.json({ ok: true, coupon: body.id ? await discountCoupons(db).findOne({ _id: id }) : value });
}
