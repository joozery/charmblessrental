// Brings the database up to a newer export of the old sheet, without touching products.
// Run: python3 scripts/extract-rental.py "backup/<new>.xlsx" .local/rental-update/source.json
// Then: node --env-file=.env.local scripts/sync-rental-update.mjs [--commit]
// Upserts ข้อมูลการเช่า and ข้อมูลการเช่า_รายการ by legacy id, and cancels open rentals that left the sheet.
// Rentals the admin already moved on (shipped / returned / cancelled there) keep their status.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const source = JSON.parse(await readFile(".local/rental-update/source.json", "utf8"));
const sheet = name => source.sheets.find(item => item.name === name)?.rows.filter(row => row.row > 1) ?? assert.fail(`Missing sheet ${name}`);
const number = value => value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const excelDate = value => number(value) === null ? null : new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
const origin = row => ({ file: source.file, importId: source.sha256, sheet: "", sheetRow: row.row });

const rentals = sheet("ข้อมูลการเช่า").filter(row => row.cells.A).map(({ cells: c, hyperlinks, row }) => ({
  legacyId: String(c.A).trim(), enteredAt: excelDate(c.B), legacyStatus: c.C || "", customerName: c.D || "", phone: c.E || "", address: c.F || "",
  shipDate: excelDate(c.G), returnDate: excelDate(c.H), rentalDateText: c.I || "", days: number(c.J), rentalTotal: number(c.K), deposit: number(c.L),
  shipping: number(c.M), total: number(c.N), bankId: c.O || "", paidAt: excelDate(c.P),
  slips: ["Q", "R", "S", "T", "U"].map(column => hyperlinks?.[column] || c[column] || "").filter(Boolean),
  carrier: c.V || "", notes: c.W || "", detailUrl: hyperlinks?.X || c.X || "", enteredBy: c.Y || "",
  source: { ...origin({ row }), sheet: "ข้อมูลการเช่า" },
}));
assert.equal(new Set(rentals.map(r => r.legacyId)).size, rentals.length, "duplicate Rent ID");
const rentalIds = new Set(rentals.map(r => r.legacyId));
const itemRows = sheet("ข้อมูลการเช่า_รายการ").filter(row => row.cells.B);
assert.equal(new Set(itemRows.map(r => r.cells.B)).size, itemRows.length, "duplicate List ID");

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db("charmblessrental"), rentalsDb = db.collection("rentals"), itemsDb = db.collection("rentalItems");
  // Products were merged into models, so an old product id lives on as a unit of the model that kept it.
  const products = new Map();
  for (const p of await db.collection("products").find({}, { projection: { id: 1, legacyId: 1, units: 1 } }).toArray()) {
    if (p.legacyId) products.set(p.legacyId, p.id);
    for (const unit of p.units || []) if (unit.legacyId) products.set(unit.legacyId, p.id);
  }
  const items = itemRows.map(({ cells: c, row }) => ({
    legacyId: c.B, rentalId: c.A || "", productLegacyId: c.C || "", productId: products.get(c.C) || null, sku: c.D || "", productName: c.E || "",
    agreedPrice: number(c.F), notes: c.G || "", rentalFound: rentalIds.has(c.A), source: { ...origin({ row }), sheet: "ข้อมูลการเช่า_รายการ" },
  }));
  const existing = await rentalsDb.find({}, { projection: { legacyId: 1, legacyStatus: 1, importedStatus: 1, shipment: 1, returned: 1, cancelled: 1 } }).toArray();
  const byId = new Map(existing.map(r => [r.legacyId, r]));
  const moved = r => r.importedStatus || r.shipment || r.returned || r.cancelled;
  const gone = existing.filter(r => !rentalIds.has(r.legacyId) && ["รอชำระเงิน", "รอจัดส่ง", "จัดส่งแล้ว"].includes(r.legacyStatus) && !moved(r));
  const toWrite = rentals.filter(r => !moved(byId.get(r.legacyId) || {}));
  const summary = {
    rentalsInSheet: rentals.length, newRentals: rentals.filter(r => !byId.has(r.legacyId)).length, keptBecauseAdminMovedThem: rentals.length - toWrite.length,
    cancelAsGone: gone.map(r => r.legacyId), items: items.length, newItems: items.filter(i => i.rentalFound).length,
    itemsWithoutProduct: items.filter(i => i.productId === null).map(i => `${i.legacyId}:${i.productLegacyId}`), itemsWithoutRental: items.filter(i => !i.rentalFound).length,
  };
  if (!process.argv.includes("--commit")) { console.log(JSON.stringify({ ...summary, mode: "dry-run" }, null, 2)); process.exit(0); }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(".local/rental-update", { recursive: true });
  const before = { rentals: await rentalsDb.find({}).toArray(), rentalItems: await itemsDb.find({}).toArray() };
  await writeFile(`.local/rental-update/backup-${stamp}.json`, JSON.stringify(before), { mode: 0o600 });
  await db.collection("productBackups").insertOne({ _id: `before-rental-update-${stamp}`, createdAt: new Date(), rentals: before.rentals.length, rentalItems: before.rentalItems.length });
  const result = await rentalsDb.bulkWrite(toWrite.map(r => ({ updateOne: { filter: { legacyId: r.legacyId }, update: { $set: r }, upsert: true } })), { ordered: false });
  const itemResult = await itemsDb.bulkWrite(items.map(i => ({ updateOne: { filter: { legacyId: i.legacyId }, update: { $set: i }, upsert: true } })), { ordered: false });
  const now = new Date();
  const cancelled = gone.length ? await rentalsDb.updateMany({ legacyId: { $in: gone.map(r => r.legacyId) } }, { $set: { legacyStatus: "ยกเลิก", importedStatus: "รอชำระเงิน", cancelled: { at: now, reason: "ไม่อยู่ในไฟล์อัปเดตล่าสุดของชีตเดิม", by: "import", byName: "นำเข้าข้อมูล" }, updatedAt: now, updatedBy: "import" } }) : { modifiedCount: 0 };
  console.log(JSON.stringify({ ...summary, mode: "committed", backup: `.local/rental-update/backup-${stamp}.json`, rentals: { inserted: result.upsertedCount, modified: result.modifiedCount }, items: { inserted: itemResult.upsertedCount, modified: itemResult.modifiedCount }, cancelled: cancelled.modifiedCount }, null, 2));
} finally {
  await client.close();
}
