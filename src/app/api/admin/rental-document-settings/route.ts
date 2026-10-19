import { currentAdmin, sameOrigin } from "@/lib/admin-auth";
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
  if (!await currentAdmin()) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!validDefaults(body)) return Response.json({ error: "ตรวจสอบข้อมูลใบรายละเอียดการเช่าอีกครั้ง" }, { status: 400 });
  await (await database()).collection<StoreSettings & { _id: string }>("storeSettings").updateOne({ _id: "main" }, { $set: { rentalDocument: body } }, { upsert: true });
  return Response.json({ settings: body });
}
