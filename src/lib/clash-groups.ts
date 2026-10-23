import type { Db } from "mongodb";
import { queueClashes } from "./availability-store";
import { addDays, blockRange, type ScheduleRecord } from "./schedule";

type Row = { _id: string; name?: string; phone?: string; status: string; createdAt?: Date | string; start: string; end: string; schedule?: ScheduleRecord | null; shipment?: object; returned?: unknown; verification?: { status: string } | null; items: { id: number; name: string; sku: string; unitSku?: string }[] };
export type ClashGroup = { key: string; item: string; from: string; to: string; bookings: { id: string; name: string; phone: string; status: string; shipped: boolean; ship: string; ready: string }[] };

// Every clash between open bookings, one group per piece and set of bookings, with the run of days they overlap.
export async function clashGroups(db: Db) {
  const rows = (await db.collection<Row>("bookingRequests").find({ status: { $ne: "cancelled" }, returned: { $exists: false } }, { projection: { _id: 1, name: 1, phone: 1, status: 1, createdAt: 1, start: 1, end: 1, schedule: 1, shipment: 1, returned: 1, "verification.status": 1, items: 1 } }).toArray()).map(row => ({ ...row, _id: String(row._id) }));
  const clashes = await queueClashes(db, rows);
  const byId = new Map(rows.map(row => [row._id, row]));
  const groups = new Map<string, ClashGroup>();
  for (const [id, list] of clashes) for (const clash of list) {
    const ids = [id, ...clash.with.map(other => other.id)].sort();
    const key = `${clash.item}|${ids.join(",")}`;
    const group = groups.get(key) || { key, item: clash.item, from: clash.date, to: clash.date, bookings: ids.map(other => byId.get(other)).filter((row): row is Row => !!row).map(row => ({ id: row._id, name: row.name || "", phone: row.phone || "", status: row.status, shipped: !!row.shipment, ship: blockRange(row).from, ready: addDays(blockRange(row).to, -1) })) };
    if (clash.date < group.from) group.from = clash.date;
    if (clash.date > group.to) group.to = clash.date;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.from.localeCompare(b.from));
}
