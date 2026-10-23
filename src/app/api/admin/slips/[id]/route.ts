import { requireAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { paymentSlips } from "@/lib/payment-slips";

// A slip image for the shop; responses are never cached.
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/slips/[id]">) {
  const auth = await requireAdmin("payments");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const slip = await (await paymentSlips(await database())).findOne({ _id: id }, { projection: { data: 1, contentType: 1 } });
  if (!slip) return new Response("ไม่พบสลิป", { status: 404 });
  return new Response(new Uint8Array(slip.data.buffer), { headers: { "Content-Type": slip.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'", "Referrer-Policy": "no-referrer" } });
}
