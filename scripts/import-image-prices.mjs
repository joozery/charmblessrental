// Sets each product's own price table from the prices printed on its product image.
// Input: .local/price-ocr/readings.tsv (product id, "3:250,5:300,…[,+extraPerDay]", note).
// Dry-run by default: writes a review report to .local/price-ocr/. Pass --commit to apply,
// which first backs up every product's pricing (file + productBackups collection).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

assert(process.env.MONGODB_URI, "MONGODB_URI is required");
const commit = process.argv.includes("--commit"), overwrite = process.argv.includes("--overwrite");
const dir = ".local/price-ocr";

const parse = text => {
  const parts = text.split(",").filter(Boolean);
  const extra = parts.find(part => part.startsWith("+"));
  const tiers = parts.filter(part => !part.startsWith("+")).map(part => { const [days, price] = part.split(":").map(Number); return { days, price }; }).sort((a, b) => a.days - b.days);
  return { tiers, extraPerDay: extra ? Number(extra.slice(1)) : null };
};
const readings = (await readFile(`${dir}/readings.tsv`, "utf8")).trim().split("\n").map(line => {
  const [id, prices, note = ""] = line.split("\t");
  return { id: Number(id), pricing: prices ? parse(prices) : null, note: note.trim() };
});

const client = await MongoClient.connect(process.env.MONGODB_URI);
try {
  const db = client.db(), products = db.collection("products");
  const stored = new Map((await products.find({}, { projection: { _id: 0, id: 1, sku: 1, name: 1, active: 1, customPricing: 1, dailyRate: 1 } }).toArray()).map(p => [p.id, p]));
  const rows = readings.map(reading => {
    const product = stored.get(reading.id), flags = [];
    if (!product) flags.push("ไม่พบสินค้า");
    if (!reading.pricing) flags.push("ไม่มีราคาในรูป");
    const tiers = reading.pricing?.tiers || [];
    if (tiers.some((tier, i) => !Number.isSafeInteger(tier.days) || !(tier.price > 0) || (i && tier.price <= tiers[i - 1].price))) flags.push("ราคาไม่เรียงจากน้อยไปมาก");
    if (product?.customPricing?.tiers?.length && !overwrite) flags.push("มีราคาเฉพาะอยู่แล้ว");
    if (reading.note && reading.pricing) flags.push("มีหมายเหตุ");
    const apply = !!product && !!reading.pricing && !flags.some(flag => flag !== "มีหมายเหตุ");
    return { ...reading, product, flags, apply };
  });
  const table = pricing => pricing ? pricing.tiers.map(t => `${t.days} วัน ${t.price}`).join(" / ") + (pricing.extraPerDay == null ? "" : ` / เกินวันละ ${pricing.extraPerDay}`) : "";
  const csv = [["id", "รหัส", "ชื่อ", "แสดงหน้าร้าน", "ราคาที่อ่านได้", "จะบันทึก", "ธง", "หมายเหตุ"],
    ...rows.map(r => [r.id, r.product?.sku || "", r.product?.name || "", r.product?.active ? "ใช่" : "ไม่", table(r.pricing), r.apply ? "ใช่" : "ไม่", r.flags.join("; "), r.note])]
    .map(cols => cols.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  await writeFile(`${dir}/report.csv`, "﻿" + csv);
  const toApply = rows.filter(r => r.apply);
  const summary = { readings: rows.length, apply: toApply.length, skipped: rows.length - toApply.length, flagged: rows.filter(r => r.flags.length).map(r => `${r.id} ${r.product?.name || ""}: ${r.flags.join("; ")}`) };
  console.log(JSON.stringify(summary, null, 2));
  if (!commit) { console.log(`Dry-run only. Review ${dir}/report.csv, then run with --commit.`); process.exit(0); }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = toApply.map(r => ({ id: r.id, customPricing: r.product.customPricing ?? null }));
  await writeFile(`${dir}/backup-${stamp}.json`, JSON.stringify(backup, null, 2));
  await db.collection("productBackups").insertOne({ _id: `before-image-prices-${stamp}`, createdAt: new Date(), pricing: backup });
  const result = await products.bulkWrite(toApply.map(r => ({ updateOne: { filter: { id: r.id }, update: { $set: { customPricing: r.pricing } } } })));
  const now = new Date();
  await db.collection("auditLogs").insertMany(toApply.map(r => ({
    _id: randomUUID(), at: now, action: "product.price", targetType: "product", targetId: String(r.id), summary: `ตั้งราคาเฉพาะ ${r.product.name} จากรูปสินค้า`,
    actorId: null, actorName: "นำเข้าราคาจากรูปสินค้า", actorEmail: "script", changes: [{ field: "customPricing", before: r.product.customPricing ?? null, after: r.pricing }], ip: "", userAgent: "scripts/import-image-prices.mjs",
  })));
  console.log(JSON.stringify({ updated: result.modifiedCount, backup: `${dir}/backup-${stamp}.json + productBackups/before-image-prices-${stamp}` }, null, 2));
} finally {
  await client.close();
}
