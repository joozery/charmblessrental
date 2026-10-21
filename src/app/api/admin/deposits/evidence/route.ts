import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { imageType, uploadProductImage } from "@/lib/r2";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("deposits");
  if (auth.error) return auth.error;
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) return Response.json({ error: "ไฟล์ต้องไม่เกิน 5 MB" }, { status: 413 });
  try {
    const file = (await request.formData()).get("image");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return Response.json({ error: "เลือกรูปภาพขนาดไม่เกิน 5 MB" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = imageType(bytes);
    if (!type) return Response.json({ error: "รองรับรูป PNG, JPG และ WebP เท่านั้น" }, { status: 400 });
    return Response.json({ url: await uploadProductImage(bytes, type, "evidence") });
  } catch { return Response.json({ error: "อัปโหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
}
