import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { expireCredits, syncCustomersFromBookings } from "@/lib/customer-credits";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const db = await database();
  await syncCustomersFromBookings(db);
  await expireCredits(db);
  return Response.json({ ok: true });
}
