// Dry-run by default. Pass --commit to give imported rentals a phone key (customer history by phone) and the
// indexes the queue uses to find old-sheet rentals that still hold a piece (src/lib/legacy-rentals.ts).
import { MongoClient } from "mongodb";

const normalizePhone = value => String(value || "").replace(/\D/g, "").replace(/^66/, "0");
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db("charmblessrental"), rentals = db.collection("rentals");
  const rows = await rentals.find({}, { projection: { _id: 1, phone: 1, phoneKey: 1 } }).toArray();
  const changes = rows.filter(row => (row.phoneKey ?? null) !== (normalizePhone(row.phone) || null));
  const summary = { rentals: rows.length, phoneKeysToSet: changes.length, withoutPhone: rows.filter(row => !normalizePhone(row.phone)).length };
  if (!process.argv.includes("--commit")) {
    console.log(JSON.stringify({ ...summary, mode: "dry-run", next: "Pass --commit to write phone keys and indexes." }, null, 2));
    process.exit(0);
  }
  if (changes.length) await rentals.bulkWrite(changes.map(row => ({ updateOne: { filter: { _id: row._id }, update: normalizePhone(row.phone) ? { $set: { phoneKey: normalizePhone(row.phone) } } : { $unset: { phoneKey: "" } } } })), { ordered: false });
  await rentals.createIndex({ phoneKey: 1 });
  await rentals.createIndex({ legacyStatus: 1, returnDate: 1 });
  await db.collection("rentalItems").createIndex({ rentalId: 1 });
  await db.collection("rentalItems").createIndex({ productId: 1 });
  console.log(JSON.stringify({ ...summary, mode: "committed" }, null, 2));
} finally {
  await client.close();
}
