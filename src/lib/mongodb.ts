import { MongoClient } from "mongodb";
const globalMongo = globalThis as typeof globalThis & { mongoConnection?: Promise<MongoClient> };
export async function database() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("กรุณาตั้งค่า MONGODB_URI ใน .env.local");
  if (!globalMongo.mongoConnection) {
    globalMongo.mongoConnection = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect().catch(error => {
      globalMongo.mongoConnection = undefined;
      throw error;
    });
  }
  return (await globalMongo.mongoConnection).db("charmblessrental");
}
