import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { needsTracking } from "@/lib/rental-stage";
import { imageType, uploadProductImage } from "@/lib/r2";
import { photoLimit } from "@/lib/rental-photos";

type Photo = { url: string; stage: "return" | "returnReceipt"; uploadedBy: "customer"; uploadedAt: Date };
type BookingDoc = { _id: string; name?: string; status: string; billToken: string; shipment?: object; returned?: object; customerReturn?: { carrier: string; trackingNumber: string; at: Date }; photos?: { return?: Photo[]; returnReceipt?: Photo[] } };
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max;

export async function POST(request: Request, ctx: RouteContext<"/api/bill/[token]/return">) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const { token } = await ctx.params, form = await request.formData().catch(() => null), carrierValue = form?.get("carrier"), trackingValue = form?.get("trackingNumber");
  if (!/^[\w-]{20,40}$/.test(token) || !form || !text(carrierValue, 60) || !String(carrierValue).trim() || !text(trackingValue, 60)) return Response.json({ error: "กรุณากรอกข้อมูลขนส่งให้ถูกต้อง" }, { status: 400 });
  const carrier = String(carrierValue).trim(), trackingNumber = String(trackingValue).trim().toUpperCase();
  if (needsTracking(carrier) && !trackingNumber) return Response.json({ error: "กรุณากรอกเลขพัสดุ" }, { status: 400 });
  const receiptFiles = form.getAll("receipt").filter(item => item instanceof File) as File[];
  const returnFiles = form.getAll("image").filter(item => item instanceof File) as File[];
  const allFiles = [...receiptFiles, ...returnFiles];
  if (receiptFiles.length > 5 || returnFiles.length > 5 || allFiles.some(file => !file.size || file.size > photoLimit)) return Response.json({ error: "แนบรูปแต่ละหัวข้อได้ไม่เกิน 5 รูป และรูปละไม่เกิน 5 MB" }, { status: 400 });
  const bookings = (await database()).collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ billToken: token }, { projection: { _id: 1, name: 1, status: 1, shipment: 1, returned: 1, customerReturn: 1, "photos.return": 1, "photos.returnReceipt": 1 } });
  if (!booking) return Response.json({ error: "ไม่พบรายการเช่านี้" }, { status: 404 });
  if (!receiptFiles.length && !booking.photos?.returnReceipt?.length) return Response.json({ error: "กรุณาแนบรูปใบเสร็จหรือหลักฐานส่งคืนพัสดุอย่างน้อย 1 รูป" }, { status: 400 });
  if (booking.status === "cancelled" || !booking.shipment) return Response.json({ error: "รายการนี้ยังไม่ได้จัดส่ง จึงยังแจ้งส่งคืนไม่ได้" }, { status: 409 });
  if (booking.returned) return Response.json({ error: "ร้านได้รับสินค้าแล้ว จึงแจ้งส่งคืนซ้ำไม่ได้" }, { status: 409 });
  async function upload(files: File[], stage: Photo["stage"]) {
    const photos: Photo[] = [];
    for (const file of files) { const bytes = Buffer.from(await file.arrayBuffer()), type = imageType(bytes); if (!type) throw new Error("รองรับเฉพาะรูป PNG, JPG หรือ WebP"); photos.push({ url: await uploadProductImage(bytes, type, "rental-photos"), stage, uploadedBy: "customer", uploadedAt: new Date() }); }
    return photos;
  }
  let receiptPhotos: Photo[], returnPhotos: Photo[];
  try { receiptPhotos = await upload(receiptFiles, "returnReceipt"); returnPhotos = await upload(returnFiles, "return"); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ" }, { status: 400 }); }
  const customerReturn = { carrier, trackingNumber, at: new Date(), via: "bill" as const };
  const update: Record<string, unknown> = { $set: { customerReturn, updatedAt: new Date() } };
  const push: Record<string, unknown> = {};
  if (receiptPhotos.length) push["photos.returnReceipt"] = { $each: receiptPhotos };
  if (returnPhotos.length) push["photos.return"] = { $each: returnPhotos };
  if (Object.keys(push).length) update.$push = push;
  await bookings.updateOne({ _id: booking._id }, update as never);
  await audit(request, null, { action: "booking.customer_return", targetType: "booking", targetId: booking._id, summary: `ลูกค้าแจ้งส่งคืน · ${carrier} ${trackingNumber}`.trim(), actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`, changes: [{ field: "carrier", before: booking.customerReturn?.carrier ?? null, after: carrier }, { field: "trackingNumber", before: booking.customerReturn?.trackingNumber ?? null, after: trackingNumber }] });
  return Response.json({ ok: true, customerReturn: { ...customerReturn, at: customerReturn.at.toISOString() } });
}
