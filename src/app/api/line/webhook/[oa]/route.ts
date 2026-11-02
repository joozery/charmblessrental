import { lineWebhook } from "@/lib/line-webhook";

// Webhook for each extra LINE OA listed in LINE_OAS, e.g. /api/line/webhook/second.
export async function POST(request: Request, ctx: { params: Promise<{ oa: string }> }) {
  const { oa } = await ctx.params;
  return lineWebhook(request, oa.toLowerCase());
}
