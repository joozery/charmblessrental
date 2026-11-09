import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { lateReturnRisks } from "@/lib/late-returns";
import { assignUnits, unitChoices } from "@/lib/rental-units";
import { queueClashes } from "@/lib/availability-store";
import { thaiDay } from "@/lib/finance";
import type { ScheduleRecord } from "@/lib/schedule";

type Booking = {
  _id: string; name?: string; status: string; createdAt?: Date; start: string; end: string;
  schedule?: ScheduleRecord; shipment?: object; returned?: object; customerReturn?: object;
  payment?: "unpaid" | "paid"; holdUntil?: Date; waitlist?: object;
  items: { id: number; name: string; sku: string; unitSku?: string }[];
};

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 20) : [];
  if (!ids.length) return Response.json({ rows: [], unitChoices: {} });
  const db = await database();
  const rows = await db.collection<Booking>("bookingRequests").find({ _id: { $in: ids } }, { projection: { _id: 1, name: 1, status: 1, createdAt: 1, start: 1, end: 1, schedule: 1, shipment: 1, returned: 1, customerReturn: 1, payment: 1, holdUntil: 1, waitlist: 1, items: 1 } }).toArray();
  const open = rows.filter(row => row.status !== "cancelled" && !row.returned);
  const suggested = new Map(await Promise.all(open.filter(row => row.status === "confirmed" && row.items.some(item => !item.unitSku)).map(async row => [String(row._id), (await assignUnits(db, row)).map(item => item.unitSku || "")] as const)));
  const [choices, clashes, risks] = await Promise.all([
    unitChoices(db, open.flatMap(row => row.items.map(item => item.id))),
    queueClashes(db, rows),
    lateReturnRisks(db, thaiDay()),
  ]);
  return Response.json({
    rows: ids.map(id => ({ id, ...(suggested.has(id) ? { suggestedUnits: suggested.get(id) } : {}), ...(clashes.has(id) ? { clashes: clashes.get(id) } : {}), ...(risks.has(id) ? { risks: risks.get(id) } : {}) })),
    unitChoices: Object.fromEntries(choices),
  });
}
