import { sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { deposits } from "@/lib/finance";
import { database } from "@/lib/mongodb";
import { cleanRefundAccount, refundAccountError, type RefundAccount } from "@/lib/refund-account";

type BookingDoc = { _id: string; name?: string; status: string; verification?: object; refundAccount?: RefundAccount & { updatedAt: Date } };

// The bill link is the customer's key: whoever holds it can say where the deposit goes back, until the shop has refunded it.
export async function POST(request: Request, ctx: RouteContext<"/api/bill/[token]/refund-account">) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const { token } = await ctx.params;
  if (!/^[\w-]{20,40}$/.test(token)) return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
  const account = cleanRefundAccount(await request.json().catch(() => null));
  if (!account) return Response.json({ error: refundAccountError }, { status: 400 });
  const db = await database();
  const bookings = db.collection<BookingDoc>("bookingRequests");
  const booking = await bookings.findOne({ billToken: token }, { projection: { _id: 1, name: 1, status: 1, verification: 1, refundAccount: 1 } });
  if (!booking) return Response.json({ error: "ไม่พบรายการเช่านี้" }, { status: 404 });
  if (booking.status === "cancelled") return Response.json({ error: "คำขอนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (booking.verification) return Response.json({ error: "รายการนี้ไม่วางเงินมัดจำ จึงไม่ต้องกรอกบัญชีรับเงินคืน" }, { status: 409 });
  const deposit = await deposits(db).findOne({ _id: booking._id }, { projection: { status: 1 } });
  if (deposit && deposit.status !== "held" && deposit.status !== "void") return Response.json({ error: "ร้านคืนเงินมัดจำรายการนี้แล้ว" }, { status: 409 });
  await bookings.updateOne({ _id: booking._id }, { $set: { refundAccount: { ...account, updatedAt: new Date() }, updatedAt: new Date() } });
  const before = booking.refundAccount;
  await audit(request, null, { action: "booking.refund_account", targetType: "booking", targetId: booking._id, summary: `ลูกค้า${before ? "แก้ไข" : "กรอก"}บัญชีรับเงินมัดจำคืน · ${account.bank} ${account.accountNumber}`, actorEmail: `ลูกค้า${booking.name ? ` ${booking.name}` : ""}`,
    changes: (["bank", "accountName", "accountNumber"] as const).filter(field => before?.[field] !== account[field]).map(field => ({ field, before: before?.[field] ?? null, after: account[field] })) });
  return Response.json({ ok: true });
}
