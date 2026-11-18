import { requireAdmin, sameOrigin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { legacyItems, legacyRentals, type LegacyRental } from "@/lib/legacy-rentals";
import { database } from "@/lib/mongodb";
import { can } from "@/lib/permissions";
import { setUnitStatuses } from "@/lib/product-store";
import { type UnitStatus } from "@/lib/products";

// Moves a rental imported from the old sheet on: shipped, back at the shop, or cancelled. No LINE message is sent:
// these customers booked outside the website. A returned or cancelled rental frees its pieces in the queue.
const afterReturn: Record<string, UnitStatus> = { good: "available", damaged: "repair", missing: "unavailable" };
const conditionLabels: Record<string, string> = { good: "สภาพปกติ", damaged: "ชำรุด", missing: "สูญหาย/ไม่ครบ" };
const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const validReturnItems = (value: unknown) => Array.isArray(value) && value.every((item: unknown) => !!item && typeof item === "object" && typeof (item as { unitSku?: unknown }).unitSku === "string" && Object.hasOwn(afterReturn, (item as { condition?: string }).condition || "") && text((item as { note?: unknown }).note, 500));

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const auth = await requireAdmin("rentals");
  if (auth.error) return auth.error;
  const admin = auth.admin, by = admin.email || admin.username;
  const body = await request.json().catch(() => null);
  if (!body || !text(body.id, 100) || !["ship", "return", "cancel"].includes(body.action)
    || (body.action === "ship" && (!text(body.carrier, 60) || !text(body.trackingNumber, 60)))
    || (body.action === "return" && (body.itemConditions !== undefined ? !validReturnItems(body.itemConditions) : (!Object.hasOwn(afterReturn, body.condition) || !text(body.note, 500))))
    || (body.action === "cancel" && (!text(body.reason, 300) || !body.reason.trim()))) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  if (!can(admin, body.action === "cancel" ? "bookings" : "shipping")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อเจ้าของร้าน" }, { status: 403 });
  const db = await database(), rental = await legacyRentals(db).findOne({ legacyId: body.id });
  if (!rental) return Response.json({ error: "ไม่พบรายการเช่า" }, { status: 404 });
  const status = rental.legacyStatus || "";
  const skus = (await legacyItems(db).find({ rentalId: rental.legacyId }, { projection: { _id: 0, sku: 1 } }).toArray()).map(item => item.sku).filter((sku): sku is string => !!sku);
  const update = async (next: string, fields: Partial<LegacyRental>) => {
    await legacyRentals(db).updateOne({ legacyId: rental.legacyId }, { $set: { ...fields, legacyStatus: next, ...(rental.importedStatus ? {} : { importedStatus: status }), updatedAt: new Date(), updatedBy: by } });
  };
  const log = (action: string, summary: string, after: string) => audit(request, admin, { action, targetType: "rental", targetId: rental.legacyId, summary, changes: [{ field: "legacyStatus", before: status, after }] });
  const unitLog = async (before: Awaited<ReturnType<typeof setUnitStatuses>>, after: UnitStatus) => {
    for (const [sku, previous] of before) if (previous.status !== after) await audit(request, admin, { action: "product.unit", targetType: "product", targetId: String(previous.productId), summary: `${sku} ${after === "rented" ? "ส่งให้ลูกค้า" : "รับคืนจาก"} รายการเช่าเดิม ${rental.legacyId}`, changes: [{ field: "status", before: previous.status, after }] });
  };

  if (body.action === "ship") {
    if (!["รอชำระเงิน", "รอจัดส่ง", "จัดส่งแล้ว"].includes(status)) return Response.json({ error: `รายการนี้${status || "ปิดไปแล้ว"} จึงบันทึกการจัดส่งไม่ได้` }, { status: 409 });
    const shipment = { carrier: body.carrier.trim(), trackingNumber: body.trackingNumber.trim(), shippedAt: rental.shipment?.shippedAt || new Date(), by, byName: admin.name };
    await update("จัดส่งแล้ว", { shipment, carrier: [shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" ") || rental.carrier || "" });
    const before = await setUnitStatuses(db, skus.map(sku => ({ sku, status: "rented" as const })));
    await log("rental.shipped", `บันทึกการจัดส่งรายการเช่าเดิม${shipment.carrier || shipment.trackingNumber ? ` · ${shipment.carrier} ${shipment.trackingNumber}`.trimEnd() : ""}${skus.length ? ` · ชิ้น ${skus.join(", ")}` : ""}`, "จัดส่งแล้ว");
    await unitLog(before, "rented");
    return Response.json({ ok: true, legacyStatus: "จัดส่งแล้ว" });
  }
  if (body.action === "return") {
    if (!["รอจัดส่ง", "จัดส่งแล้ว", "เกินกำหนดส่ง"].includes(status)) return Response.json({ error: `รายการนี้${status || "ปิดไปแล้ว"} จึงรับคืนไม่ได้` }, { status: 409 });
    const returnedItems = skus.map((sku, index) => { const selected = Array.isArray(body.itemConditions) ? body.itemConditions[index] : null; return { unitSku: sku || "", condition: selected?.condition || body.condition, note: selected?.note?.trim() || body.note.trim() }; });
    if (Array.isArray(body.itemConditions) && (body.itemConditions.length !== skus.length || body.itemConditions.some((item: { unitSku: string }, index: number) => item.unitSku !== (skus[index] || "")))) return Response.json({ error: "ข้อมูลชิ้นสินค้าที่รับคืนไม่ตรงกับรายการ กรุณาโหลดหน้าใหม่" }, { status: 400 });
    const returned = { at: new Date(), condition: returnedItems.every(item => item.condition === returnedItems[0]?.condition) ? returnedItems[0]?.condition || "good" : "mixed", note: returnedItems.every(item => item.note === returnedItems[0]?.note) ? returnedItems[0]?.note || "" : "", items: returnedItems, by, byName: admin.name };
    await update("คืนสินค้าแล้ว", { returned });
    const before = await setUnitStatuses(db, returnedItems.filter(item => item.unitSku).map(item => ({ sku: item.unitSku, status: afterReturn[item.condition], ...(item.note ? { note: `คืนจาก ${rental.legacyId}: ${item.note}`.slice(0, 500) } : {}) })));
    await log("rental.returned", `รับคืนรายการเช่าเดิม · ${returned.condition === "good" ? conditionLabels.good : returned.condition === "damaged" ? conditionLabels.damaged : returned.condition === "missing" ? conditionLabels.missing : "ตรวจแยกตามชิ้น"}${before.size ? ` · ${[...before.keys()].join(", ")}` : ""}`, "คืนสินค้าแล้ว");
    for (const [sku, previous] of before) { const item = returnedItems.find(row => row.unitSku === sku); await audit(request, admin, { action: "product.unit", targetType: "product", targetId: String(previous.productId), summary: `${sku} รับคืนจากรายการเช่าเดิม ${rental.legacyId}`, changes: [{ field: "status", before: previous.status, after: afterReturn[item?.condition || "good"] }] }); }
    return Response.json({ ok: true, legacyStatus: "คืนสินค้าแล้ว" });
  }
  if (!["รอชำระเงิน", "รอจัดส่ง"].includes(status)) return Response.json({ error: status === "จัดส่งแล้ว" ? "ส่งสินค้าไปแล้ว กรุณาบันทึกรับคืนแทนการยกเลิก" : `รายการนี้${status || "ปิดไปแล้ว"} จึงยกเลิกไม่ได้` }, { status: 409 });
  await update("ยกเลิก", { cancelled: { at: new Date(), reason: body.reason.trim(), by, byName: admin.name } });
  await log("rental.cancelled", `ยกเลิกรายการเช่าเดิม · ${body.reason.trim()}`, "ยกเลิก");
  return Response.json({ ok: true, legacyStatus: "ยกเลิก" });
}
