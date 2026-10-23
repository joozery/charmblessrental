import { requireAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";

export async function GET() {
  const auth = await requireAdmin("bookings");
  if (auth.error) return auth.error;
  const products = await (await database()).collection("products").find({ active: { $ne: false } }, { projection: { _id: 0, id: 1, name: 1, thai: 1, sku: 1, image: 1, images: 1, stock: 1 } }).sort({ id: 1 }).toArray();
  return Response.json({ products });
}
