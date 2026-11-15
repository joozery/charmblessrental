import { requireAdmin } from "@/lib/admin-auth";
import { R2_PUBLIC_URL } from "@/lib/product-images";

export async function GET(request: Request) {
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const raw = new URL(request.url).searchParams.get("url") || "";
  let target: URL;
  try { target = new URL(raw, request.url); } catch { return new Response("Invalid image", { status: 400 }); }
  const requestOrigin = new URL(request.url).origin;
  if (target.origin !== requestOrigin && !target.href.startsWith(`${R2_PUBLIC_URL}/`)) return new Response("Image host is not allowed", { status: 403 });
  try {
    const response = await fetch(target, { cache: "no-store" });
    if (!response.ok) return new Response("Image not found", { status: 404 });
    return new Response(await response.arrayBuffer(), { headers: { "Content-Type": response.headers.get("content-type") || "application/octet-stream", "Cache-Control": "private, no-store" } });
  } catch { return new Response("Image could not be loaded", { status: 502 }); }
}
