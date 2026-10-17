// Dry-run by default. Pass --commit to upsert only rows from ข้อมูลการเช่า.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const manifest = JSON.parse(await readFile(".local/rental-history/source.json", "utf8"));
assert.equal(manifest.sheet, "ข้อมูลการเช่า", "Source must contain only the rental history worksheet");
const rows = manifest.rows.filter(row => row.row > 1 && row.cells.A).map(row => ({ ...row, legacyId: String(row.cells.A).trim() }));
const duplicateIds = rows.map(row => row.legacyId).filter((id, index, all) => all.indexOf(id) !== index);
assert.equal(duplicateIds.length, 0, `Duplicate Rent ID values: ${[...new Set(duplicateIds)].join(", ")}`);

const number = value => value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const excelDate = value => number(value) === null ? null : new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
const mapped = rows.map(({ row, cells, hyperlinks, legacyId }) => ({
  legacyId,
  enteredAt: excelDate(cells.B),
  legacyStatus: cells.C || "",
  customerName: cells.D || "",
  phone: cells.E || "",
  address: cells.F || "",
  shipDate: excelDate(cells.G),
  returnDate: excelDate(cells.H),
  rentalDateText: cells.I || "",
  days: number(cells.J),
  rentalTotal: number(cells.K),
  deposit: number(cells.L),
  shipping: number(cells.M),
  total: number(cells.N),
  bankId: cells.O || "",
  paidAt: excelDate(cells.P),
  slips: ["Q", "R", "S", "T", "U"].map(column => hyperlinks?.[column] || cells[column] || "").filter(Boolean),
  carrier: cells.V || "",
  notes: cells.W || "",
  detailUrl: hyperlinks?.X || cells.X || "",
  enteredBy: cells.Y || "",
  source: { file: manifest.file, importId: manifest.sha256, sheet: manifest.sheet, sheetRow: row },
}));

const statusCounts = Object.fromEntries([...mapped.reduce((counts, rental) => counts.set(rental.legacyStatus || "(ไม่ระบุ)", (counts.get(rental.legacyStatus || "(ไม่ระบุ)") || 0) + 1), new Map())]);
const summary = { sheet: manifest.sheet, rows: mapped.length, uniqueRentIds: new Set(mapped.map(row => row.legacyId)).size, statusCounts };
if (!process.argv.includes("--commit")) {
  console.log(JSON.stringify({ ...summary, mode: "dry-run", next: "Pass --commit to upsert these rental records only." }, null, 2));
  process.exit(0);
}

assert(process.env.MONGODB_URI, "MONGODB_URI is required for --commit");
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const collection = client.db("charmblessrental").collection("rentals");
  await collection.createIndex({ legacyId: 1 }, { unique: true });
  await collection.createIndex({ enteredAt: -1 });
  await collection.createIndex({ legacyStatus: 1, enteredAt: -1 });
  const result = await collection.bulkWrite(mapped.map(rental => ({
    updateOne: { filter: { legacyId: rental.legacyId }, update: { $set: rental }, upsert: true },
  })), { ordered: false });
  console.log(JSON.stringify({ ...summary, mode: "committed", inserted: result.upsertedCount, matched: result.matchedCount, modified: result.modifiedCount }, null, 2));
} finally {
  await client.close();
}
