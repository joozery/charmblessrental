import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit, diff } from "@/lib/audit";
import { database } from "@/lib/mongodb";
import { revalidateTag } from "next/cache";
import { getStoreSettings, type StoreSettings } from "@/lib/store-settings";

const isImage = (value: unknown) => typeof value === "string" && value.length <= 2000 && (!value || value.startsWith("/") && !value.startsWith("//") || (() => { try { const url = new URL(value); return url.protocol === "https:"; } catch { return false; } })());
const isSafeUrl = (value: unknown) => typeof value === "string" && value.length <= 1000 && (!value || (() => { try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; } })());

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("settings");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as Partial<StoreSettings> | null;
  if (!body || !isImage(body.logoImage) || !isImage(body.heroImage) || !isImage(body.promotionImage) || !Number.isSafeInteger(body.emsFee) || (body.emsFee as number) < 0 || (body.emsFee as number) > 100000 || !["lineUrl", "instagramUrl", "facebookUrl"].every(key => isSafeUrl(body[key as keyof StoreSettings])) || typeof body.heroTitle !== "string" || body.heroTitle.length > 180 || typeof body.heroSubtitle !== "string" || body.heroSubtitle.length > 400 || typeof body.howTitle !== "string" || body.howTitle.length > 160 || typeof body.contactTitle !== "string" || body.contactTitle.length > 160 || typeof body.contactDescription !== "string" || body.contactDescription.length > 300 || typeof body.footerTagline !== "string" || body.footerTagline.length > 200 || typeof body.shippingText !== "string" || body.shippingText.length > 400 || !Array.isArray(body.howSteps) || body.howSteps.length !== 3 || body.howSteps.some(step => !step || typeof step.title !== "string" || step.title.length > 120 || typeof step.description !== "string" || step.description.length > 240) || !Array.isArray(body.rentalRules) || body.rentalRules.length > 30 || body.rentalRules.some(rule => typeof rule !== "string" || rule.length > 1200)) {
    return Response.json({ error: "ตรวจสอบข้อมูลที่กรอกและความยาวข้อความอีกครั้ง" }, { status: 400 });
  }
  const storefrontSettings = { ...body };
  delete storefrontSettings.rentalDocument;
  const before = await getStoreSettings();
  await (await database()).collection<StoreSettings & { _id?: string }>("storeSettings").updateOne({ _id: "main" }, { $set: storefrontSettings, $setOnInsert: { _id: "main" } }, { upsert: true });
  revalidateTag("catalog", { expire: 0 });
  const changes = diff(before, storefrontSettings);
  if (changes.length) await audit(request, auth.admin, { action: "settings.store", targetType: "settings", targetId: "store", summary: "แก้ไขการตั้งค่าหน้าร้าน", changes });
  return Response.json({ settings: await getStoreSettings() });
}
