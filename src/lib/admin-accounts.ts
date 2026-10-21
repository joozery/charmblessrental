import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { database } from "./mongodb";
import type { Permission } from "./permissions";
const derive = promisify(scrypt);
export type AdminAccount = { _id: string; email?: string; username: string; name: string; passwordHash: string; role: "owner" | "admin"; permissions?: Permission[]; active: boolean; version: number; createdAt: Date };
export type PublicAdmin = Omit<AdminAccount, "passwordHash">;
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, hex] = encoded.split(":");
  if (!salt || !hex || hex.length !== 128) return false;
  const hash = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(hash, Buffer.from(hex, "hex"));
}
let initialization: Promise<void> | undefined;
export async function adminAccounts() {
  const collection = (await database()).collection<AdminAccount>("admins");
  initialization ??= (async () => {
    await collection.createIndex({ username: 1 }, { unique: true });
    await collection.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
    if (!await collection.findOne({ _id: "bootstrap-owner" }) && process.env.ADMIN_PASSWORD) {
      await collection.updateOne({ _id: "bootstrap-owner" }, { $setOnInsert: {
        ...(process.env.ADMIN_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim()) ? { email: process.env.ADMIN_EMAIL.trim().toLowerCase() } : {}),
        username: "admin", name: "เจ้าของร้าน", passwordHash: await hashPassword(process.env.ADMIN_PASSWORD), role: "owner", active: true, version: 1, createdAt: new Date(),
      } }, { upsert: true });
    }
    const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (bootstrapEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail)) {
      await collection.updateOne({ _id: "bootstrap-owner", email: { $exists: false } }, { $set: { email: bootstrapEmail } });
    }
  })().catch(error => { initialization = undefined; throw error; });
  await initialization;
  return collection;
}
export async function listAdmins(): Promise<PublicAdmin[]> {
  return (await adminAccounts()).find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: 1 }).toArray() as Promise<PublicAdmin[]>;
}
export async function createAdmin(input: { email: string; name: string; password: string; active: boolean; permissions: Permission[] }) {
  const _id = randomUUID();
  await (await adminAccounts()).insertOne({ _id, email: input.email, username: randomUUID(), name: input.name, passwordHash: await hashPassword(input.password), role: "admin", permissions: input.permissions, active: input.active, version: 1, createdAt: new Date() });
  return _id;
}
