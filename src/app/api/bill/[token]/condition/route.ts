import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { imageType, uploadProductImage } from "@/lib/r2";
import { photoLimit, receivedDeadline, type ReceivedCondition } from "@/lib/rental-photos";
export async function POST(request: Request, ctx: RouteContext<"/api/bill/[token]/condition">) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const { token } = await ctx.params, form = await request.formData().catch(() => null), value = form?.get("condition");
  if (!/^[\w-]{20,40}$/.test(token) || !form || value !== "normal" && value !== "damaged") return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  type BookingConditionDoc = { _id: string; name?: string; status: string; start: string; shipment?: unknown; receivedCondition?: ReceivedCondition };
  const db = await database(), bookings = db.collection<BookingConditionDoc>("bookingRequests"), booking = await bookings.findOne({ billToken: token }, { projection: { _id: 1, name: 1, status: 1, start: 1, shipment: 1, receivedCondition: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบรายการเช่านี้" }, { status: 404 });
  if (booking.status === "cancelled" || !booking.shipment) return Response.json({ error: "รายการนี้ยังไม่สามารถแจ้งสภาพสินค้าได้" }, { status: 409 });
  if (new Date() > receivedDeadline(booking.start)) return Response.json({ error: "หมดเวลาสำหรับแจ้งสภาพสินค้าแล้ว กรุณาติดต่อร้าน" }, { status: 409 });
  const files = form.getAll("image").filter(item => item instanceof File) as File[];
  if (value === "damaged" && !files.length) return Response.json({ error: "กรณีชำรุดกรุณาแนบรูปอย่างน้อย 1 รูป" }, { status: 400 });
  if (files.length > 5 || files.some(file => !file.size || file.size > photoLimit)) return Response.json({ error: "แนบรูปได้ไม่เกิน 5 รูป และรูปละไม่เกิน 5 MB" }, { status: 400 });
  const photos = [];
  for (const file of files) { const bytes = Buffer.from(await file.arrayBuffer()), type = imageType(bytes); if (!type) return Response.json({ error: "รองรับเฉพาะรูป PNG, JPG หรือ WebP" }, { status: 400 }); photos.push({ url: await uploadProductImage(bytes, type, "rental-photos"), stage: "received", uploadedBy: "customer", uploadedAt: new Date(), condition: value }); }
  const condition: ReceivedCondition = { value, at: new Date(), by: "customer", note: String(form.get("note") || "").trim().slice(0, 500) };
  await bookings.updateOne({ _id: booking._id }, { $set: { receivedCondition: condition, updatedAt: new Date() }, ...(photos.length ? { $push: { "photos.received": { $each: photos } } } : {}) } as never);
  await audit(request, null, { action: "booking.received_condition", targetType: "booking", targetId: booking._id, summary: `ลูกค้าแจ้งสภาพสินค้า: ${value === "damaged" ? "ชำรุด" : "ปกติ"}`, actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}` });
  return Response.json({ ok: true, condition, photos });
}
