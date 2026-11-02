import { lineWebhook } from "@/lib/line-webhook";

// The original LINE OA keeps its webhook URL. Other accounts post to /api/line/webhook/<oa>.
export const POST = (request: Request) => lineWebhook(request, "main");
