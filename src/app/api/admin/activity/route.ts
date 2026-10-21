import { requireAdmin } from "@/lib/admin-auth";
import { auditLogs } from "@/lib/audit";
// Per-record timeline. Booking timelines are open to booking staff; anything else needs the activity permission.
export async function GET(request: Request) {
  const targetId = new URL(request.url).searchParams.get("targetId") || "";
  if (!targetId || targetId.length > 100) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const auth = await requireAdmin(targetId.startsWith("BR-") ? "bookings" : "activity");
  if (auth.error) return auth.error;
  const rows = await (await auditLogs()).find({ targetId }, { projection: { ip: 0, userAgent: 0 } }).sort({ at: -1 }).limit(100).toArray();
  return Response.json({ logs: rows.map(row => ({ ...row, at: row.at.toISOString() })) }, { headers: { "Cache-Control": "private, no-store" } });
}
