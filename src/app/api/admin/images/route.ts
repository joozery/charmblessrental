import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { uploadProductImage } from "@/lib/r2";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("products");
  if (auth.error) return auth.error;
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) return Response.json({ error: "ไฟล์ต้องไม่เกิน 5 MB" }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return Response.json({ error: "เลือกรูปภาพขนาดไม่เกิน 5 MB" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
    if (!type) return Response.json({ error: "รองรับรูป PNG, JPG และ WebP เท่านั้น" }, { status: 400 });
    const url = await uploadProductImage(bytes, type);
    return Response.json({ url });
  } catch { return Response.json({ error: "อัปโหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
}
