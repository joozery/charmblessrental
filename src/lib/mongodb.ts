import { MongoClient, type Db } from "mongodb";
const globalMongo = globalThis as typeof globalThis & { mongoConnection?: Promise<MongoClient>; indexesReady?: Promise<void> };
async function ensureQueryIndexes(db: Db) {
  if (!globalMongo.indexesReady) {
    globalMongo.indexesReady = Promise.all([
      db.collection("bookingRequests").createIndexes([
        { key: { status: 1, createdAt: -1 } },
        { key: { status: 1, payment: 1, paidAt: -1 } },
        { key: { payment: 1, shipment: 1, returned: 1, status: 1 } },
        { key: { shipment: 1, returned: 1, status: 1 } },
        { key: { createdAt: 1 } },
        { key: { paidAt: 1 } },
        { key: { "penalties.createdAt": 1 } },
        { key: { billOwner: 1, quote: 1 } },
        { key: { "items.id": 1, status: 1, start: 1 } },
        { key: { "items.unitSku": 1, status: 1, returned: 1 } },
        { key: { "schedule.ship": 1 } },
        { key: { "schedule.returnDate": 1 } },
        { key: { status: 1, shipment: 1, returned: 1, "schedule.returnDate": 1 } },
      ]),
      db.collection("rentals").createIndexes([
        { key: { enteredAt: -1 } },
        { key: { shipDate: 1 } },
        { key: { returnDate: 1 } },
        { key: { paidAt: -1 } },
        { key: { legacyStatus: 1, shipment: 1, returned: 1, cancelled: 1, returnDate: 1 } },
      ]),
      db.collection("rentalItems").createIndex({ rentalId: 1 }),
      db.collection("financeTransactions").createIndex({ date: -1, _id: -1 }),
      db.collection("auditLogs").createIndex({ targetType: 1, targetId: 1, action: 1, at: 1 }),
      db.collection("discountCoupons").createIndex({ createdAt: -1 }),
      db.collection("deposits").createIndex({ status: 1, receivedAt: 1 }),
      db.collection("customerCredits").createIndex({ type: 1, remaining: 1, expiresAt: 1 }),
      db.collection("customers").createIndex({ updatedAt: -1 }),
      db.collection("customerCredits").createIndex({ customerId: 1, createdAt: -1 }),
    ]).then(() => undefined).catch(error => {
      globalMongo.indexesReady = undefined;
      console.error("Query index setup failed:", error);
    });
  }
  await globalMongo.indexesReady;
}
export async function database() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("กรุณาตั้งค่า MONGODB_URI ใน .env.local");
  if (!globalMongo.mongoConnection) {
    globalMongo.mongoConnection = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect().catch(error => {
      globalMongo.mongoConnection = undefined;
      throw error;
    });
  }
  const db = (await globalMongo.mongoConnection).db("charmblessrental");
  await ensureQueryIndexes(db);
  return db;
}
