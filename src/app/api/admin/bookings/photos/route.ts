import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { imageType, uploadProductImage } from "@/lib/r2";
import { photoLimit, type RentalPhotoStage } from "@/lib/rental-photos";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;
  try {
    const form = await request.formData(), id = form.get("bookingId"), stage = form.get("stage"), file = form.get("image");
    if (typeof id !== "string" || !id || !["beforeShipment", "received", "return"].includes(String(stage)) || !(file instanceof File) || !file.size || file.size > photoLimit) return Response.json({ error: "ข้อมูลรูปไม่ถูกต้อง" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer()), type = imageType(bytes);
    if (!type) return Response.json({ error: "รองรับเฉพาะรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 5 MB" }, { status: 400 });
    type BookingPhotoDoc = { _id: string; photos?: Record<string, unknown[]> };
    const db = await database(), booking = await db.collection<BookingPhotoDoc>("bookingRequests").findOne({ _id: id }, { projection: { _id: 1, photos: 1 } });
    if (!booking) return Response.json({ error: "ไม่พบคำขอจอง" }, { status: 404 });
    const key = stage as RentalPhotoStage, existing = Array.isArray(booking.photos?.[key]) ? booking.photos[key] : [];
    if (existing.length >= 5) return Response.json({ error: "แนบรูปได้สูงสุด 5 รูปต่อช่วง" }, { status: 400 });
    const url = await uploadProductImage(bytes, type, "rental-photos"), photo = { url, stage: key, uploadedBy: "admin", uploadedAt: new Date() };
    await db.collection<BookingPhotoDoc>("bookingRequests").updateOne({ _id: id }, { $push: { [`photos.${key}`]: photo } as never, $set: { updatedAt: new Date() } });
    await audit(request, auth.admin, { action: "booking.photo_uploaded", targetType: "booking", targetId: id, summary: `อัปโหลดรูป${key === "beforeShipment" ? "ก่อนจัดส่ง" : key === "received" ? "ตอนรับสินค้า" : "ตอนส่งคืน"}` });
    return Response.json({ ok: true, photo });
  } catch { return Response.json({ error: "อัปโหลดรูปไม่สำเร็จ" }, { status: 500 }); }
}
