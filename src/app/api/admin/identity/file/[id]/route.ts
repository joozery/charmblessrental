import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { identityFiles } from "@/lib/identity-store";
import { database } from "@/lib/mongodb";

// Every view of an ID document is logged; responses are never cached.
export async function GET(request: Request, ctx: RouteContext<"/api/admin/identity/file/[id]">) {
  const auth = await requireAdmin("identity");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const file = await identityFiles(await database()).findOne({ _id: id });
  if (!file) return new Response("ไม่พบไฟล์ หรือถูกลบตามกำหนดแล้ว", { status: 404 });
  await audit(request, auth.admin, { action: "identity.viewed", targetType: "booking", targetId: file.bookingId, summary: `เปิดดู${file.kind === "idCard" ? "รูปบัตรประชาชน" : "เซลฟี่คู่บัตร"}` });
  return new Response(new Uint8Array(file.data.buffer), { headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'", "Referrer-Policy": "no-referrer" } });
}
