import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { identityFileKinds, type BookingVerification } from "@/lib/identity";
import { readImage, saveSubmission } from "@/lib/identity-store";
import { database } from "@/lib/mongodb";

type BookingDoc = { _id: string; name?: string; phone: string; status: string; verification?: BookingVerification };
const text = (form: FormData, key: string, max: number) => { const value = form.get(key); return typeof value === "string" && value.trim().length <= max ? value.trim() : null; };
const validPhone = (value: string) => /^0[689]\d{8}$/.test(value.replace(/[\s()-]/g, "")) || /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, ""));

// The bill link is the customer's key; documents arrive as already-shrunk JPEGs from the browser.
export async function POST(request: Request, ctx: RouteContext<"/api/bill/[token]/identity">) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const { token } = await ctx.params;
  if (!/^[\w-]{20,40}$/.test(token)) return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
  const fullName = text(form, "fullName", 120), address = text(form, "address", 600), backupPhone = text(form, "backupPhone", 20), social = text(form, "social", 200);
  if (!fullName || !address || !backupPhone || social === null) return Response.json({ error: "กรุณากรอกชื่อ-นามสกุล ที่อยู่ และเบอร์ติดต่อสำรองให้ครบ" }, { status: 400 });
  if (!validPhone(backupPhone)) return Response.json({ error: "เบอร์ติดต่อสำรองไม่ถูกต้อง" }, { status: 400 });
  if (form.get("consent") !== "yes") return Response.json({ error: "กรุณายินยอมให้ร้านเก็บข้อมูลเพื่อยืนยันตัวตน" }, { status: 400 });
  const files = [];
  for (const kind of identityFileKinds) {
    const file = form.get(kind.key);
    if (!(file instanceof File) || !file.size) return Response.json({ error: `กรุณาแนบ${kind.label}` }, { status: 400 });
    const image = readImage(Buffer.from(await file.arrayBuffer()));
    if (!image) return Response.json({ error: `${kind.label} ต้องเป็นรูป JPG / PNG / WebP ขนาดไม่เกิน 3MB` }, { status: 400 });
    files.push({ kind: kind.key, ...image });
  }
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ billToken: token }, { projection: { _id: 1, name: 1, phone: 1, status: 1, verification: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบรายการเช่านี้" }, { status: 404 });
  if (booking.verification?.mode !== "identity") return Response.json({ error: "รายการนี้เลือกแบบวางเงินมัดจำ ไม่ต้องส่งเอกสาร" }, { status: 409 });
  if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (booking.verification.status === "approved") return Response.json({ error: "ยืนยันตัวตนเรียบร้อยแล้ว ไม่ต้องส่งใหม่" }, { status: 409 });
  await saveSubmission(db, booking, booking.verification.profileId, { fullName, address, backupPhone, social }, files);
  const verification: BookingVerification = { ...booking.verification, status: "submitted", submittedAt: new Date(), reason: "" };
  await bookings.updateOne({ _id: booking._id }, { $set: { verification, updatedAt: new Date() } });
  await audit(request, null, { action: "identity.submitted", targetType: "booking", targetId: booking._id, summary: `ลูกค้าส่งเอกสารยืนยันตัวตน (${files.length} รูป)`, actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}` });
  return Response.json({ ok: true, status: "submitted" });
}
