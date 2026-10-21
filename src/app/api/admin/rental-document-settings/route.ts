import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import type { RentalDocumentDefaults, StoreSettings } from "@/lib/store-settings";

function validUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 1000) return false;
  if (!value) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function validDefaults(value: unknown): value is RentalDocumentDefaults {
  if (!value || typeof value !== "object") return false;
  const fields = value as Record<string, unknown>;
  return typeof fields.deposit === "number" && Number.isFinite(fields.deposit) && fields.deposit >= 0 && fields.deposit <= 1000000 &&
    validUrl(fields.qrImage) && ["bank", "accountName", "accountNumber", "returnAddress", "returnPhone", "returnMethod"].every(key => typeof fields[key] === "string" && (fields[key] as string).length <= 500);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("settings");
  if (auth.error) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  if (!validDefaults(body)) return Response.json({ error: "ตรวจสอบข้อมูลใบรายละเอียดการเช่าอีกครั้ง" }, { status: 400 });
  const settings = (await database()).collection<StoreSettings & { _id: string }>("storeSettings");
  const before = await settings.findOne({ _id: "main" }, { projection: { rentalDocument: 1 } });
  await settings.updateOne({ _id: "main" }, { $set: { rentalDocument: body } }, { upsert: true });
  const changes = diff(before?.rentalDocument, body as unknown as Record<string, unknown>);
  if (changes.length) await audit(request, auth.admin, { action: "settings.rental_document", targetType: "settings", targetId: "rentalDocument", summary: "แก้ไขค่าเริ่มต้นใบรายละเอียดการเช่า", changes });
  return Response.json({ settings: body });
}
