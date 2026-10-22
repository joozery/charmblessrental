import type { Db } from "mongodb";
import { isBlocking } from "./availability-store";
import { unitChoices } from "./rental-units";
import type { NextRisk } from "./queue";
import { addDays, blockRange, countUseDays, returnDay, type ScheduleRecord } from "./schedule";

type Row = { _id: string; name?: string; status: string; createdAt?: Date | string; start: string; end: string; schedule?: ScheduleRecord | null; shipment?: unknown; returned?: unknown; customerReturn?: unknown; verification?: { status: string } | null; items: { id: number; name: string; sku: string; unitSku?: string }[] };
// The piece is still with the customer after the day it was due back, and the customer has not said it is on its way.
export const lateDays = (row: Row, today: string) => row.status === "confirmed" && row.shipment && !row.returned && !row.customerReturn && returnDay(row) < today ? countUseDays(returnDay(row), today) - 1 : 0;
// Where the open rentals that matter for late returns stand: shipped and not back, or confirmed and waiting for a piece.
export const lateFilter = { status: { $ne: "cancelled" }, returned: { $exists: false } };

// For each rental out with a customer that is late, or due within a day with the next rental right behind it:
// the next booking that needs the same piece, and other pieces of that product free for it.
export async function lateReturnRisks(db: Db, today: string) {
  const rows = await db.collection<Row>("bookingRequests").find(lateFilter, { projection: { _id: 1, name: 1, status: 1, createdAt: 1, start: 1, end: 1, schedule: 1, shipment: 1, returned: 1, customerReturn: 1, "verification.status": 1, items: 1 } }).toArray();
  const out = rows.filter(row => row.status === "confirmed" && row.shipment && !row.customerReturn);
  const waiting = rows.filter(row => !row.shipment && isBlocking(row));
  const result = new Map<string, NextRisk[]>();
  if (!out.length || !waiting.length) return result;
  const choices = await unitChoices(db, out.flatMap(row => row.items.map(item => item.id)));
  const confirmed = rows.filter(row => row.status === "confirmed");
  for (const row of out) {
    const late = lateDays(row, today) > 0, ready = blockRange(row).to;
    if (!late && returnDay(row) > addDays(today, 1)) continue;
    for (const item of row.items) {
      // The next rental of this product that will want this piece: promised to it, or not given a piece yet.
      const next = waiting.filter(other => other._id !== row._id && blockRange(other).from >= blockRange(row).from && other.items.some(entry => entry.id === item.id && (!entry.unitSku || entry.unitSku === item.unitSku))).sort((a, b) => blockRange(a).from.localeCompare(blockRange(b).from))[0];
      if (!next) continue;
      const ship = blockRange(next).from;
      // Not late yet: only worth a warning when the next rental leaves no slack after this one's gap.
      if (!late && ship > addDays(ready, 1)) continue;
      const range = blockRange(next);
      const busy = new Set(confirmed.filter(other => other._id !== next._id && blockRange(other).from < range.to && blockRange(other).to > range.from).flatMap(other => other.items.map(entry => entry.unitSku)).filter(Boolean));
      const swap = (choices.get(item.id) || []).map(unit => unit.sku).filter(sku => sku !== item.unitSku && !busy.has(sku));
      result.set(row._id, [...(result.get(row._id) || []), { item: item.sku || item.name, unitSku: item.unitSku || "", next: { id: next._id, name: next.name || "", ship }, swap }]);
    }
  }
  return result;
}
