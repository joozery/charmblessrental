import { database } from "@/lib/mongodb";
import { getEffectiveAvailability } from "@/lib/availability-store";

const validMonth = (value: string | null) => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = Number(url.searchParams.get("productId"));
  const month = url.searchParams.get("month");
  if (!Number.isSafeInteger(productId) || productId < 1 || !validMonth(month)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const from = `${month}-01`;
  const date = new Date(`${from}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1);
  const to = date.toISOString().slice(0, 10);
  const days = await getEffectiveAvailability(await database(), productId, from, to);
  return Response.json({ days }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}
