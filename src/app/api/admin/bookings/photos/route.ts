import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { deletePublicImage, imageType, uploadProductImage } from "@/lib/r2";
import { photoLimit, validPhotoUrl, type RentalPhotoStage } from "@/lib/rental-photos";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;
  try {
    const form = await request.formData(), id = form.get("bookingId"), stage = form.get("stage"), file = form.get("image");
    const isUpload = file !== null && typeof file !== "string" && typeof file.arrayBuffer === "function" && typeof file.size === "number";
    if (typeof id !== "string" || !id) return Response.json({ error: "ไม่พบเลขออเดอร์สำหรับรูปภาพ" }, { status: 400 });
    if (!["beforeShipment", "received", "return"].includes(String(stage))) return Response.json({ error: "ช่วงเวลาของรูปภาพไม่ถูกต้อง" }, { status: 400 });
    if (!isUpload || !file.size) return Response.json({ error: "กรุณาเลือกไฟล์รูปภาพ" }, { status: 400 });
    if (file.size > photoLimit) return Response.json({ error: "ไฟล์รูปภาพต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
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

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("shipping");
  if (auth.error) return auth.error;
  try {
    const body = await request.json(), id = body?.bookingId, stage = body?.stage, url = body?.url;
    if (typeof id !== "string" || !id || stage !== "beforeShipment" || !validPhotoUrl(url)) return Response.json({ error: "ข้อมูลรูปไม่ถูกต้อง" }, { status: 400 });
    const db = await database(), result = await db.collection("bookingRequests").updateOne({ _id: id, "photos.beforeShipment.url": url } as never, { $pull: { "photos.beforeShipment": { url } }, $set: { updatedAt: new Date() } } as never);
    if (!result.matchedCount) return Response.json({ error: "ไม่พบรูปที่ต้องการลบ" }, { status: 404 });
    await deletePublicImage(url);
    await audit(request, auth.admin, { action: "booking.photo_deleted", targetType: "booking", targetId: id, summary: "ลบรูปก่อนจัดส่ง" });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "ลบรูปไม่สำเร็จ" }, { status: 500 }); }
}
