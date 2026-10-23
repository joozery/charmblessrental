import { database } from "@/lib/mongodb";
import { paymentSlips, recheckDelays } from "@/lib/payment-slips";
import { checkSlip } from "@/lib/slip2go";
import { settleSlip } from "@/lib/slip-settle";

// Called every minute by the server's crontab (Authorization: Bearer $CRON_SECRET). Asks Slip2Go again about slips
// the bank had no record of when the customer sent them; after the last try the slip goes to the shop as before.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = await database(), slips = await paymentSlips(db);
  const due = await slips.find({ status: "checking", recheckAt: { $lte: new Date() } }).sort({ recheckAt: 1 }).limit(10).toArray();
  let settled = 0;
  for (const slip of due) {
    // Claim it first, so an overlapping run cannot spend a second Slip2Go token on the same slip.
    if (!(await slips.updateOne({ _id: slip._id, status: "checking", recheckAt: slip.recheckAt }, { $set: { recheckAt: new Date(Date.now() + 10 * 60000) } })).modifiedCount) continue;
    const check = await checkSlip(slip.data.buffer, slip.contentType, false), rechecks = (slip.rechecks || 0) + 1;
    if (!check.ok && check.retry && rechecks < recheckDelays.length) {
      await slips.updateOne({ _id: slip._id, status: "checking" }, { $set: { rechecks, recheckAt: new Date(Date.now() + recheckDelays[rechecks]), reason: check.reason, ...(check.raw ? { raw: check.raw } : {}) } });
      continue;
    }
    if (await settleSlip(db, request, { ...slip, rechecks }, check, true)) settled++;
  }
  return Response.json({ ok: true, checked: due.length, settled });
}
