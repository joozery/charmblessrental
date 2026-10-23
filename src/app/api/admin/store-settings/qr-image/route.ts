import { requireAdmin } from "@/lib/admin-auth";

// The public image bucket sends no CORS headers, so the settings page reads an uploaded QR through this route
// to get the text inside it. Only images from the shop's own bucket are fetched.
export async function GET(request: Request) {
  const auth = await requireAdmin("settings");
  if (auth.error) return auth.error;
  const url = new URL(request.url).searchParams.get("url") || "", base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base || !url.startsWith(`${base}/`)) return Response.json({ error: "อ่านได้เฉพาะรูปที่อัปโหลดในระบบ" }, { status: 400 });
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }).catch(() => null);
  const type = response?.headers.get("content-type") || "";
  if (!response?.ok || !type.startsWith("image/")) return Response.json({ error: "โหลดรูป QR ไม่สำเร็จ" }, { status: 502 });
  return new Response(await response.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
