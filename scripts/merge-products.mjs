// Folds duplicate product rows into one product with several pieces (units).
// Dry-run by default: writes a review report to .local/product-merge/. Pass --commit to apply,
// which first backs up every product (file + productBackups collection).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

assert(process.env.MONGODB_URI, "MONGODB_URI is required");
const commit = process.argv.includes("--commit");

// Same model code, names differ only by spelling: merged on top of the by-name grouping.
const mergeCodes = ["A0050", "A0089", "A0099", "A0113", "A0114", "A0119", "A0174", "A0192", "A0212", "A0238", "A0268", "A0272", "A0281"];
// Same model code but a different size, colour or item: deliberately kept apart.
const keptApart = ["A0000", "A0079", "A0112", "A0171", "A0183", "A0219", "A0229", "A0236", "A0240", "A0243", "A0287", "B0001"];

// Thai warnings typed in front of the name ("รอพรี ASRV…", "ห้ามปล่อยเช่า…") become a piece note.
const splitName = raw => {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  const match = name.match(/^([฀-๿][^A-Za-z]*?)\s*(?=[A-Za-z])/);
  return match ? { name: name.slice(match[0].length).trim(), warning: match[1].trim() } : { name, warning: "" };
};
const groupKey = name => splitName(name).name.toUpperCase();
// "A0312-01 พร้อมใช้งาน20/10" -> "A0312-01" + note; "A135-02" -> "A0135-02"
const splitSku = raw => {
  const value = String(raw || "").trim();
  const match = value.match(/^([A-Za-z]+)(\d+)(-\d+)?\s*(.*)$/);
  if (!match) return { sku: value, note: "" };
  const digits = /^[A-Za-z]$/.test(match[1]) && match[2].length < 4 ? match[2].padStart(4, "0") : match[2];
  return { sku: `${match[1].toUpperCase()}${digits}${match[3] || ""}`, note: match[4].replace(/^\((.*)\)$/, "$1").trim() };
};
const skuBase = sku => sku.match(/^(.*?)-\d+$/)?.[1] || sku;
const key = value => JSON.stringify(value ?? null);
const distinct = values => [...new Map(values.map(value => [key(value), value])).values()];
const mostCommon = values => {
  const counts = new Map();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) || 0) + 1);
  return counts.size ? JSON.parse([...counts].sort((a, b) => b[1] - a[1])[0][0]) : null;
};
const firstSet = values => mostCommon(values.filter(value => value !== null && value !== undefined && value !== ""));
const sum = values => values.some(value => typeof value === "number") ? values.reduce((total, value) => total + (value || 0), 0) : null;

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
try {
  const db = client.db("charmblessrental");
  const products = await db.collection("products").find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
  if (products.some(product => Array.isArray(product.units))) throw new Error("Products already have pieces (units): the merge has already been applied.");
  const historyByProduct = new Map((await db.collection("rentalItems").aggregate([{ $group: { _id: "$productId", count: { $sum: 1 } } }]).toArray()).map(row => [row._id, row.count]));

  // Union-find over rows: same cleaned name, or same model code listed in mergeCodes.
  const parent = new Map(products.map(product => [product.id, product.id]));
  const find = id => parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id));
  const join = (a, b) => parent.set(find(a), find(b));
  const firstBy = new Map();
  for (const product of products) {
    const keys = [`name:${groupKey(product.name)}`];
    if (mergeCodes.includes(skuBase(splitSku(product.sku).sku))) keys.push(`code:${skuBase(splitSku(product.sku).sku)}`);
    for (const k of keys) { if (firstBy.has(k)) join(product.id, firstBy.get(k)); else firstBy.set(k, product.id); }
  }
  const groups = new Map();
  for (const product of products) groups.set(find(product.id), [...(groups.get(find(product.id)) || []), product]);

  let nextCode = Math.max(0, ...products.map(product => Number(splitSku(product.sku).sku.match(/^A(\d+)/)?.[1] || 0)));
  const models = [...groups.values()].map(rows => {
    rows.sort((a, b) => splitSku(a.sku).sku.localeCompare(splitSku(b.sku).sku, "en", { numeric: true }) || a.id - b.id);
    const keep = rows.reduce((min, row) => row.id < min.id ? row : min, rows[0]);
    const nameCounts = new Map();
    for (const row of rows) nameCounts.set(splitName(row.name).name, (nameCounts.get(splitName(row.name).name) || 0) + 1);
    const name = [...nameCounts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const description = firstSet(rows.map(row => row.notes || row.description || ""));
    const units = rows.map(row => {
      let { sku, note } = splitSku(row.sku);
      if (!sku) sku = `A${String(++nextCode).padStart(4, "0")}-01`;
      const { warning } = splitName(row.name);
      const ownNote = row.notes || row.description || "";
      return {
        sku, rawSku: row.sku || "", legacyProductId: row.id, legacyId: row.legacyId || "", cost: row.cost ?? null,
        legacyRevenue: row.legacyRevenue ?? null, legacyProfit: row.legacyProfit ?? null,
        status: row.active === false || warning ? "unavailable" : "available",
        note: [note, warning, row.active === false ? "ปิดแสดงหน้าร้านอยู่เดิม" : "", ownNote && ownNote !== description ? ownNote : ""].filter(Boolean).join(" · ").slice(0, 500),
        image: row.images?.[0] || "", rentalHistory: historyByProduct.get(row.id) || 0,
      };
    });
    const flags = [];
    const bases = distinct(units.map(unit => skuBase(unit.sku)));
    if (bases.length > 1) flags.push(`รวมหลายรหัส: ${bases.join(", ")}`);
    if (nameCounts.size > 1) flags.push(`รวมชื่อที่พิมพ์ต่างกัน: ${[...nameCounts.keys()].join(" / ")} → ใช้ "${name}"`);
    if (rows.length > 1 && distinct(rows.map(row => row.images?.[0] || "")).length > 1) flags.push("รูปไม่เหมือนกันทุกชิ้น (รวมเป็นแกลเลอรี)");
    for (const [field, label] of [["category", "หมวด"], ["dailyRate", "ราคาเช่า"], ["deposit", "เงินประกัน"], ["size", "ไซซ์"], ["color", "สี"]]) {
      const values = distinct(rows.map(row => row[field] ?? ""));
      if (values.length > 1) flags.push(`${label}ไม่ตรงกัน: ${values.map(value => value === "" ? "(ว่าง)" : value).join(" / ")}`);
    }
    if (units.some(unit => unit.rawSku !== unit.sku)) flags.push("แก้หรือแยกหมายเหตุออกจากรหัสสินค้า");
    const category = mostCommon(rows.map(row => row.category));
    return {
      keepId: keep.id, mergedIds: rows.filter(row => row.id !== keep.id).map(row => row.id), flags, units,
      product: {
        name, thai: name, sku: skuBase(units[0].sku), category, tag: rows.find(row => row.category === category)?.tag || keep.tag,
        color: firstSet(rows.map(row => row.color)) || "", size: firstSet(rows.map(row => row.size)) || "",
        dailyRate: firstSet(rows.map(row => row.dailyRate)), deposit: firstSet(rows.map(row => row.deposit)),
        description: description || "", notes: description || "",
        images: [...new Set([...(keep.images || []), ...rows.flatMap(row => row.images || [])].filter(Boolean))],
        active: rows.some(row => row.active !== false),
        cost: sum(units.map(unit => unit.cost)), legacyRevenue: sum(units.map(unit => unit.legacyRevenue)), legacyProfit: sum(units.map(unit => unit.legacyProfit)),
        stock: units.filter(unit => unit.status === "available").length,
      },
    };
  }).sort((a, b) => b.units.length - a.units.length || a.product.name.localeCompare(b.product.name));

  // Piece codes must be unique across the shop; a cleaned code that collides keeps its original text.
  const owners = new Map();
  for (const model of models) for (const unit of model.units) owners.set(unit.sku, (owners.get(unit.sku) || 0) + 1);
  for (const model of models) {
    const clashes = model.units.filter(unit => owners.get(unit.sku) > 1);
    for (const unit of clashes) unit.sku = unit.rawSku.replace(/\s+/g, "") || unit.sku;
    if (clashes.length) model.flags.push(`รหัสชนกัน คงรหัสเดิม: ${clashes.map(unit => unit.sku).join(", ")}`);
  }
  const allSkus = models.flatMap(model => model.units.map(unit => unit.sku));
  assert.equal(new Set(allSkus).size, allSkus.length, `Duplicate piece codes: ${allSkus.filter((sku, index) => allSkus.indexOf(sku) !== index).join(", ")}`);
  assert.equal(allSkus.length, products.length, "Every product row must become exactly one piece");

  const merged = models.filter(model => model.units.length > 1);
  const summary = {
    mode: commit ? "commit" : "dry-run",
    productRowsNow: products.length, productsAfterMerge: models.length, productsWithSeveralPieces: merged.length,
    rowsFoldedIntoOthers: merged.reduce((total, model) => total + model.mergedIds.length, 0),
    totalPieces: allSkus.length, unavailablePieces: models.reduce((total, model) => total + model.units.length - model.product.stock, 0),
    productsToReview: models.filter(model => model.flags.length).length,
    rentalHistoryRowsKept: [...historyByProduct.values()].reduce((total, count) => total + count, 0),
    nextModelCode: `A${String(nextCode + 1).padStart(4, "0")}`, keptApart,
  };

  const csvCell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["ชื่อสินค้า (หลังรวม)", "รหัสสินค้า", "หมวด", "สต๊อก (ชิ้น)", "พร้อมเช่า", "id ที่คงไว้", "รหัสชิ้น", "รหัสเดิม", "id เดิมของชิ้น", "ต้นทุน", "สถานะชิ้น", "หมายเหตุชิ้น", "ประวัติเช่า (ครั้ง)", "ข้อควรตรวจ"];
  const lines = [header, ...models.flatMap(model => model.units.map((unit, index) => [
    index ? "" : model.product.name, index ? "" : model.product.sku, index ? "" : model.product.category, index ? "" : model.units.length, index ? "" : model.product.stock, index ? "" : model.keepId,
    unit.sku, unit.rawSku, unit.legacyProductId, unit.cost, unit.status === "available" ? "พร้อมเช่า" : "ไม่พร้อมเช่า", unit.note, unit.rentalHistory, index ? "" : model.flags.join(" | "),
  ]))].map(row => row.map(csvCell).join(","));
  await mkdir(".local/product-merge", { recursive: true });
  await writeFile(".local/product-merge/report.json", JSON.stringify({ summary, models }, null, 2));
  await writeFile(".local/product-merge/report.csv", "﻿" + lines.join("\n"));

  if (!commit) {
    console.log(JSON.stringify({ ...summary, topMerged: merged.slice(0, 8).map(model => `${model.product.name}: ${model.units.length} ชิ้น`), report: ".local/product-merge/report.csv", next: "Pass --commit to apply." }, null, 2));
  } else {
    const idMap = new Map(models.flatMap(model => model.mergedIds.map(id => [id, model.keepId])));
    const mergedIds = [...idMap.keys()];
    assert.equal(await db.collection("productAvailability").countDocuments({ productId: { $in: mergedIds } }), 0, "Daily availability exists for products being merged; move it by hand first");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(`.local/product-merge/backup-${stamp}.json`, JSON.stringify(products, null, 2));
    await db.collection("productBackups").insertOne({ _id: `before-merge-${stamp}`, createdAt: new Date(), products });
    const now = new Date();
    await db.collection("products").bulkWrite([
      ...models.map(model => ({ updateOne: { filter: { id: model.keepId }, update: { $set: { ...model.product, units: model.units.map(unit => ({ sku: unit.sku, cost: unit.cost, status: unit.status, note: unit.note, addedAt: null, legacyProductId: unit.legacyProductId, legacyId: unit.legacyId, legacyRevenue: unit.legacyRevenue, legacyProfit: unit.legacyProfit, image: unit.image })), mergedFrom: model.mergedIds, updatedAt: now } } } })),
      { deleteMany: { filter: { id: { $in: mergedIds } } } },
    ], { ordered: true });
    await db.collection("products").createIndex({ "units.sku": 1 }, { unique: true });
    const rentalItems = await db.collection("rentalItems").bulkWrite(models.filter(model => model.mergedIds.length).map(model => ({ updateMany: { filter: { productId: { $in: model.mergedIds } }, update: { $set: { productId: model.keepId } } } })));
    let bookingsUpdated = 0;
    for (const booking of await db.collection("bookingRequests").find({ "items.id": { $in: mergedIds } }).toArray()) {
      await db.collection("bookingRequests").updateOne({ _id: booking._id }, { $set: { items: booking.items.map(item => idMap.has(item.id) ? { ...item, id: idMap.get(item.id) } : item) } });
      bookingsUpdated++;
    }
    await db.collection("counters").updateOne({ _id: "productCodes" }, { $max: { sequence: nextCode } }, { upsert: true });
    console.log(JSON.stringify({ ...summary, backup: `.local/product-merge/backup-${stamp}.json + productBackups/before-merge-${stamp}`, rentalItemsRelinked: rentalItems.modifiedCount, bookingsUpdated }, null, 2));
  }
} finally { await client.close(); }
