import QRCode from "qrcode";
import { billQrPayload } from "@/lib/bill-qr";
import { activeExtensions, type Extension } from "@/lib/extension";
import { database } from "@/lib/mongodb";
import { billDue } from "@/lib/payment-slips";
import { getStoreSettings } from "@/lib/store-settings";

type BillDoc = { billToken: string; status: string; payment?: "unpaid" | "paid"; quote?: { rental?: number; deposit?: number; shipping?: number; qrImage?: string; accountNumber?: string }; extensions?: Extension[] };

// The shop's QR with what this bill still owes fixed in it: the rental bill until it is paid, or an unpaid extension
// or fine bill by its own link. Scanning it fills the amount in the customer's banking app.
export async function GET(_request: Request, ctx: RouteContext<"/bill/[token]/qr">) {
  const { token } = await ctx.params;
  if (!/^[\w-]{20,40}$/.test(token)) return new Response("ไม่พบ QR", { status: 404 });
  const row = await (await database()).collection<BillDoc>("bookingRequests").findOne({ $or: [{ billToken: token }, { "extensions.billToken": token }] }, { projection: { billToken: 1, status: 1, payment: 1, quote: 1, extensions: 1 } });
  const extension = row && row.billToken !== token ? activeExtensions(row.extensions).find(item => item.billToken === token && item.status === "unpaid") : null;
  const amount = !row || row.status === "cancelled" || !row.quote ? 0 : extension ? extension.amount : row.billToken === token && row.payment !== "paid" ? billDue(row.quote) : 0;
  const payload = amount > 0 ? billQrPayload((await getStoreSettings()).rentalDocument, row?.quote, amount) : null;
  if (!payload) return new Response("ไม่มียอดค้างชำระ", { status: 404 });
  const png = await QRCode.toBuffer(payload, { type: "png", width: 480, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
