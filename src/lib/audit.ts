import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { database } from "./mongodb";

export type AuditChange = { field: string; before: unknown; after: unknown };
export type AuditLog = {
  _id: string; at: Date; action: string; targetType: string; targetId: string; summary: string;
  actorId: string | null; actorName: string; actorEmail: string; changes: AuditChange[]; ip: string; userAgent: string;
};
type Actor = { _id: string; name: string; email?: string; username: string } | null;

const clip = (value: unknown): unknown => {
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") { const text = JSON.stringify(value); return text.length > 300 ? `${text.slice(0, 300)}…` : value; }
  return value ?? null;
};
// Shallow diff of the fields that changed, so the log shows before/after values for each edit.
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>, fields = Object.keys(after)): AuditChange[] {
  return fields.filter(field => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after[field] ?? null)).map(field => ({ field, before: clip(before?.[field]), after: clip(after[field]) }));
}

let indexes: Promise<unknown> | undefined;
export async function auditLogs(db?: Db) {
  const collection = (db || await database()).collection<AuditLog>("auditLogs");
  indexes ??= collection.createIndexes([{ key: { at: -1 } }, { key: { targetId: 1, at: -1 } }, { key: { actorId: 1, at: -1 } }, { key: { action: 1, at: -1 } }]).catch(error => { indexes = undefined; throw error; });
  await indexes;
  return collection;
}

// Append-only: nothing in the app updates or deletes these records.
export async function audit(request: Request, actor: Actor, entry: { action: string; targetType: string; targetId: string; summary: string; changes?: AuditChange[]; actorEmail?: string }) {
  try {
    await (await auditLogs()).insertOne({
      _id: randomUUID(), at: new Date(), action: entry.action, targetType: entry.targetType, targetId: entry.targetId, summary: entry.summary,
      actorId: actor?._id || null, actorName: actor?.name || "", actorEmail: actor?.email || actor?.username || entry.actorEmail || "", changes: entry.changes || [],
      ip: (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "").trim().slice(0, 64),
      userAgent: (request.headers.get("user-agent") || "").slice(0, 300),
    });
  } catch (error) { console.error("Audit log failed:", error); }
}
