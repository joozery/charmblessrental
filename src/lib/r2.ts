import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { R2_PUBLIC_URL } from "./product-images";
export async function uploadProductImage(bytes: Buffer, type: string, folder: "products" | "storefront" = "products") {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error("R2_NOT_CONFIGURED");
  const client = new S3Client({ region: "auto", endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
  const extension = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const key = `${folder}/${randomUUID()}.${extension}`;
  try {
    await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: bytes, ContentType: type, CacheControl: "public, max-age=31536000, immutable" }));
    return `${R2_PUBLIC_URL}/${key}`;
  } finally { client.destroy(); }
}
