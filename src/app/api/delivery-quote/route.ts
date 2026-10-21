import { sameOrigin } from "@/lib/admin-auth";
import { quoteDelivery } from "@/lib/delivery-quote";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";

type Counter = { _id: string; n: number; at: Date };
// Each quote may call paid Google APIs, so one visitor gets a handful per 10 minutes.
async function allowed(request: Request) {
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "local").trim().slice(0, 64);
  const counters = (await database()).collection<Counter>("rateLimits");
  await counters.createIndex({ at: 1 }, { expireAfterSeconds: 600 }).catch(() => undefined);
  const counter = await counters.findOneAndUpdate({ _id: `delivery:${ip}:${Math.floor(Date.now() / 600000)}` }, { $inc: { n: 1 }, $setOnInsert: { at: new Date() } }, { upsert: true, returnDocument: "after" });
  return (counter?.n || 0) <= 20;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || (body.pin !== undefined && (typeof body.pin !== "string" || body.pin.length > 1000)) || (body.address !== undefined && (typeof body.address !== "string" || body.address.length > 1000)) || (!body.pin?.trim() && !body.address?.trim())) return Response.json({ error: "กรุณากรอกที่อยู่หรือแนบหมุดตำแหน่ง" }, { status: 400 });
  if (!await allowed(request)) return Response.json({ error: "คำนวณค่าส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" }, { status: 429 });
  const settings = await getStoreSettings();
  const quote = await quoteDelivery(await database(), settings.messenger, { pin: body.pin?.trim(), address: body.address?.trim() });
  return "error" in quote ? Response.json(quote, { status: 422 }) : Response.json({ ...quote, inBill: settings.messenger.inBill });
}
