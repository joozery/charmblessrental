import { database } from "@/lib/mongodb";
import { promoteWaitlist } from "@/lib/waitlist";

// For an outside scheduler to call every few minutes (Authorization: Bearer $CRON_SECRET), so a waiting request gets
// its turn soon after the hold before it lapses even when nobody has the shop or the admin open.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, promoted: await promoteWaitlist(await database(), request) });
}
