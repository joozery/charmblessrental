"use client";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { categoryLabels, prepStatuses, unitStatusLabels, unitsForVariant, unitsOf, type Product, type ProductUnit, type UnitStatus } from "@/lib/products";
import PriceTiersEditor, { pricingFrom, rowsFrom, type TierRow } from "@/components/price-tiers-editor";
import { startingTier } from "@/lib/pricing";
import ProductMergeDialog, { type MergeDraft } from "@/components/product-merge-dialog";
import ColorPresetsDialog from "@/components/color-presets-dialog";
import type { ProductColorOption } from "@/lib/product-store";

type Draft = {
  id?: number; sku: string; name: string; category: string; description: string; images: string[];
  color: string; size: string; dailyRate: number | null; deposit: number | null; depositRequired: boolean; shippingFee: number | null; gapDays: number | null; active: boolean;
  pieces: number; cost: number | null;
  custom: boolean; tierRows: TierRow[]; extra: string;
  variants: VariantDraft[];
};
type VariantDraft = { id: string; color: string; colorCode: string; size: string; images: string[]; count: number; cost: number | null; costMixed?: boolean };
type Restock = { product: Product; variantId?: string; count: number; cost: number | null; note: string };
const empty: Draft = { sku: "", name: "", category: "เสื้อ", description: "", images: [], color: "", size: "", dailyRate: null, deposit: null, depositRequired: false, shippingFee: null, gapDays: null, active: true, pieces: 1, cost: null, custom: false, tierRows: rowsFrom(null), extra: "", variants: [{ id: "v1", color: "", colorCode: "", size: "", images: [], count: 1, cost: null }] };
const money = (value?: number | null) => value == null ? "—" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const numeric = (input: HTMLInputElement) => Number.isNaN(input.valueAsNumber) ? null : input.valueAsNumber;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
async function prepareImage(file: File) {
  if (file.size <= MAX_IMAGE_BYTES) return file;
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const value = new window.Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error("อ่านรูปภาพไม่สำเร็จ")); value.src = source; });
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("ปรับขนาดรูปไม่สำเร็จ");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46, 0.34]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    }
    throw new Error("รูปใหญ่เกินไป แม้ปรับขนาดอัตโนมัติแล้ว กรุณาเลือกรูปที่เล็กลง");
  } finally { URL.revokeObjectURL(source); }
}
const nextCodes = (product: Product, count: number, variantId?: string) => {
  const code = product.sku || "";
  const variant = variantId && variantId !== "legacy" ? product.variants?.find(item => item.id === variantId) : null;
  const unitCode = variant ? `${code}-${(variant.colorCode || variant.id).toUpperCase()}${variant.size ? `-${variant.size.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12)}` : ""}` : code;
  const last = Math.max(0, ...unitsOf(product).filter(unit => !variantId || unit.variantId === variantId).map(unit => unit.sku.startsWith(`${unitCode}-`) ? Number(unit.sku.slice(unitCode.length + 1)) || 0 : 0));
  return Array.from({ length: Math.min(count, 50) }, (_, index) => `${unitCode}-${String(last + index + 1).padStart(2, "0")}`);
};
async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || "บันทึกไม่สำเร็จ") as Error & { code?: string }; error.code = result.code; throw error; }
  return result as { products: Product[]; categories?: string[]; colors?: ProductColorOption[] };
}

const ready = (p: Product) => unitsOf(p).filter(unit => unit.status === "available").length;
export default function AdminProducts({ initialProducts, initialCategories, initialColors }: { initialProducts: Product[]; initialCategories: string[]; initialColors: ProductColorOption[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialProducts);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [categories, setCategories] = useState(initialCategories);
  const [colorOptions, setColorOptions] = useState(initialColors);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [colorDialog, setColorDialog] = useState(false);
  const [colorName, setColorName] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);
  const [mergePicker, setMergePicker] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restock, setRestock] = useState<Restock | null>(null);
  const [unitEdits, setUnitEdits] = useState<Record<string, ProductUnit>>({});
  const [preview, setPreview] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const products = items;
  const pieces = products.flatMap(p => unitsOf(p));
  const shown = products.filter(p => `${p.name} ${p.sku || ""} ${unitsOf(p).map(unit => unit.sku).join(" ")} ${p.category} ${p.notes || p.description}`.toLowerCase().includes(query.trim().toLowerCase()) && (category === "all" || p.category === category) && (stockFilter === "all" || (stockFilter === "in" ? ready(p) > 0 : ready(p) === 0)));
  const pageCount = Math.max(1, Math.ceil(shown.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const paginated = shown.slice(currentPage * 30, (currentPage + 1) * 30);
  const original = draft?.id ? products.find(p => p.id === draft.id) : undefined;

  async function addCategory() {
    const name = categoryName.trim();
    if (!name) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await post("/api/admin/products", { action: "category.create", name: name.trim() });
      setCategories(result.categories || categories);
      setDraft(current => current ? { ...current, category: name.trim() } : current);
      setNotice(`เพิ่มหมวดหมู่ ${name.trim()} แล้ว`);
      setCategoryName(""); setCategoryDialog(false);
    } catch (e) { setError(e instanceof Error ? e.message : "เพิ่มหมวดหมู่ไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function addColor() {
    setBusy(true); setError("");
    try { const result = await post("/api/admin/products", { action: "color.create", color: colorName, colorCode }); setColorOptions(result.colors || colorOptions); setColorName(""); setColorCode(""); setColorDialog(false); setNotice("เพิ่มสีและรหัสสีแล้ว"); }
    catch (e) { setError(e instanceof Error ? e.message : "เพิ่มสีไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function updateColor(color: string, code: string) {
    setBusy(true); setError("");
    try { const result = await post("/api/admin/products", { action: "color.update", color, colorCode: code }); setColorOptions(result.colors || colorOptions); setNotice(`แก้รหัสสี ${color} แล้ว`); }
    catch (e) { setError(e instanceof Error ? e.message : "แก้รหัสสีไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function resetColors() {
    setBusy(true); setError("");
    try { const result = await post("/api/admin/products", { action: "color.reset" }); setColorOptions(result.colors || []); setNotice("ล้างรายการสีตั้งต้นแล้ว"); }
    catch (e) { setError(e instanceof Error ? e.message : "ล้างสีไม่สำเร็จ"); } finally { setBusy(false); }
  }

  function startMerge() {
    setError(""); setNotice(""); setMergePicker("");
    setMergeDraft({ name: "", sku: "", category: categories[0] || "เสื้อ", rows: [] });
  }
  function toggleMergeSource(product: Product) {
    if (!mergeDraft) return;
    const exists = mergeDraft.rows.some(row => row.sourceProductId === product.id);
    const preset = colorOptions.find(option => option.color === product.color);
    const rows = exists ? mergeDraft.rows.filter(row => row.sourceProductId !== product.id) : [...mergeDraft.rows, { sourceProductId: product.id, legacySku: product.sku || String(product.id), color: product.color || "", colorCode: preset?.colorCode || "", size: product.size || "", count: unitsOf(product).length, cost: unitsOf(product)[0]?.cost ?? product.cost ?? null, images: product.images?.length ? product.images : product.image ? [product.image] : [] }];
    setMergeDraft({ ...mergeDraft, rows });
  }
  async function saveMerge(event: React.FormEvent) {
    event.preventDefault(); if (!mergeDraft) return;
    if (mergeDraft.rows.length < 1) { setError("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await post("/api/admin/products", { action: "product.merge", name: mergeDraft.name, sku: mergeDraft.sku, category: mergeDraft.category, rows: mergeDraft.rows.map(row => ({ sourceProductId: row.sourceProductId, color: row.color, colorCode: row.colorCode, size: row.size, cost: row.cost })) });
      setMergeDraft(null); done(result, "รวมสินค้าเรียบร้อยแล้ว สินค้าเก่าถูกเก็บไว้เป็นประวัติ");
    } catch (e) { setError(e instanceof Error ? e.message : "รวมสินค้าไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  function done(result: { products: Product[] }, message: string) {
    setItems(result.products); setNotice(message); startTransition(() => router.refresh());
  }
  // A legacy per-day rate becomes this product's own table: 1 day = rate, each extra day + rate.
  function customFields(product: Product) {
    const own = product.customPricing?.tiers.length ? product.customPricing : product.dailyRate != null ? { tiers: [{ days: 1, price: product.dailyRate }], extraPerDay: product.dailyRate } : null;
    return { custom: !!own, tierRows: rowsFrom(own), extra: own?.extraPerDay == null ? "" : String(own.extraPerDay) };
  }
  function edit(product?: Product) {
    setError(""); setNotice(""); setUnitEdits({});
    setDraft(product ? { id: product.id, sku: product.sku || "", name: product.name, category: product.category, description: product.notes ?? product.description, images: product.images, color: product.color || "", size: product.size || "", dailyRate: null, deposit: product.deposit ?? null, depositRequired: product.depositRequired === true, shippingFee: product.shippingFee ?? null, gapDays: product.gapDays ?? null, active: product.active !== false, pieces: 0, cost: null, variants: product.variants?.map(variant => { const costs = [...new Set(unitsForVariant(product, variant.id).filter(unit => unit.status !== "retired").map(unit => unit.cost))]; return { ...variant, colorCode: variant.colorCode || "", count: unitsForVariant(product, variant.id).filter(unit => unit.status !== "retired").length, cost: costs.length === 1 ? costs[0] : costs.length > 1 ? null : variant.cost ?? null, costMixed: costs.length > 1 }; }) || [], ...customFields(product) } : { ...empty, variants: [{ ...empty.variants[0], color: colorOptions[0]?.color || "", colorCode: colorOptions[0]?.colorCode || "" }] });
  }
  function addVariant() {
    if (!draft) return;
    const used = new Set(draft.variants.map(item => item.colorCode).filter(Boolean));
    const option = colorOptions.find(item => !used.has(item.colorCode));
    setDraft({ ...draft, variants: [...draft.variants, { id: `v${Math.max(0, ...draft.variants.map(item => Number(item.id.slice(1)) || 0)) + 1}`, color: option?.color || "", colorCode: option?.colorCode || "", size: "", images: [], count: draft.id ? 0 : 1, cost: null }] });
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    setBusy(true); setError("");
    try {
      const data = new FormData(); data.append("image", await prepareImage(file));
      const response = await fetch("/api/admin/images", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "อัปโหลดไม่สำเร็จ");
      setDraft(current => current ? { ...current, images: [...current.images, result.url] } : null);
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function uploadVariant(index: number, file?: File) {
    if (!file || !draft) return;
    setBusy(true); setError("");
    try {
      const data = new FormData(); data.append("image", await prepareImage(file));
      const response = await fetch("/api/admin/images", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "อัปโหลดไม่สำเร็จ");
      setDraft(current => current ? { ...current, variants: current.variants.map((variant, at) => at === index ? { ...variant, images: [result.url] } : variant) } : null);
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setError("");
    try {
      const { id, sku, pieces: count, cost, custom, tierRows, extra, variants, ...rest } = draft;
      const customPricing = custom ? pricingFrom(tierRows, extra) : null;
      if (typeof customPricing === "string") throw new Error(customPricing);
      if (custom && !customPricing?.tiers.length) throw new Error("กรอกราคาเฉพาะอย่างน้อย 1 แถว หรือยกเลิกการใช้ราคาเฉพาะ");
      const fields = { ...rest, customPricing, variants };
      let confirmSkuChange = false;
      let result;
      for (;;) {
        try { result = await post("/api/admin/products", id ? { id, sku, ...fields, confirmSkuChange } : { sku, ...fields, pieces: count, cost }); break; }
        catch (cause) { if (!confirmSkuChange && cause instanceof Error && (cause as Error & { code?: string }).code === "PRODUCT_IN_USE" && window.confirm(cause.message)) { confirmSkuChange = true; continue; } throw cause; }
      }
      setDraft(null); done(result!, id ? "บันทึกข้อมูลสินค้าเรียบร้อยแล้ว" : `เพิ่มสินค้าใหม่ ${variants.length ? variants.reduce((sum, variant) => sum + variant.count, 0) : count} ชิ้นแล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  async function addStock(event: React.FormEvent) {
    event.preventDefault(); if (!restock) return;
    setBusy(true); setError("");
    try {
      const result = await post("/api/admin/products/units", { action: "add", productId: restock.product.id, variantId: restock.variantId, count: restock.count, cost: restock.cost, note: restock.note });
      setRestock(null); done(result, `เติมสต๊อก ${restock.product.name} +${restock.count} ชิ้นแล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "เติมสต๊อกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function saveUnit(product: Product, unit: ProductUnit) {
    setBusy(true); setError("");
    try {
      const result = await post("/api/admin/products/units", { action: "update", productId: product.id, sku: unit.sku, cost: unit.cost, status: unit.status, note: unit.note });
      setUnitEdits(current => { const next = { ...current }; delete next[unit.sku]; return next; });
      done(result, `บันทึกชิ้น ${unit.sku} แล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกชิ้นไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function deleteUnit(product: Product, unit: ProductUnit) {
    if (!window.confirm(`ยืนยันลบชิ้น ${unit.sku} ใช่หรือไม่?\n\nการลบจะนำชิ้นนี้ออกจากสต๊อกถาวร และไม่สามารถกู้คืนจากหน้านี้ได้`)) return;
    setBusy(true); setError("");
    try {
      const result = await post("/api/admin/products/units", { action: "delete", productId: product.id, sku: unit.sku, cost: unit.cost, note: unit.note });
      setUnitEdits(current => { const next = { ...current }; delete next[unit.sku]; return next; });
      done(result, `ลบชิ้น ${unit.sku} แล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "ลบชิ้นไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function removeProduct(product: Product) {
    if (product.active !== false || !window.confirm(`ยืนยันการลบสินค้า “${product.name}” หรือไม่?\n\nการลบจะทำได้เมื่อสินค้าถูกซ่อนและไม่มีคำขอจองที่ยังใช้งานอยู่`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ลบสินค้าไม่สำเร็จ");
      done(result as { products: Product[] }, `ลบสินค้า ${product.name} เรียบร้อยแล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "ลบสินค้าไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return <>
    <ProductMergeDialog draft={mergeDraft} busy={busy} error={error} products={products} categories={categories} colors={colorOptions} picker={mergePicker} onPickerChange={setMergePicker} onChange={setMergeDraft} onToggleSource={toggleMergeSource} onSave={saveMerge} onClose={() => { setMergeDraft(null); setError(""); }} /><ColorPresetsDialog open={colorDialog} busy={busy} error={error} color={colorName} code={colorCode} colors={colorOptions} onColor={setColorName} onCode={setColorCode} onSave={() => { void addColor(); }} onUpdate={(name, code) => { void updateColor(name, code); }} onReset={() => { void resetColors(); }} onClose={() => { setColorDialog(false); setError(""); }} />
    <main className="admin-main inventory-page">
      <div className="admin-page-title"><div><h1>ข้อมูลสินค้า</h1><p>สินค้าแต่ละรายการมีได้หลายชิ้น รหัสสินค้าและรหัสชิ้นสร้างอัตโนมัติ กด “เติมสต๊อก” เมื่อได้ชุดเดิมมาเพิ่ม</p></div><div className="inventory-page-actions"><Button variant="outline" onClick={() => { setCategoryName(""); setCategoryDialog(true); }}><Icon name="plus" />เพิ่มหมวดหมู่</Button><Button variant="outline" onClick={() => { setColorName(""); setColorCode(""); setColorDialog(true); }}><Icon name="plus" />เพิ่มสี / รหัสสี</Button><Button variant="outline" onClick={startMerge}><Icon name="plus" />รวมสินค้า</Button><Button variant="primary" onClick={() => edit()}><Icon name="plus" />เพิ่มสินค้าใหม่</Button></div></div>
      <section className="admin-stats grid gap-4 md:grid-cols-3" aria-label="ภาพรวมข้อมูลสินค้า">
        <article><span>สินค้าทั้งหมด</span><strong>{products.length.toLocaleString("th-TH")}<small>รายการ</small></strong><p>รวมชุดเดียวกันไว้เป็นรายการเดียว</p></article>
        <article><span>สต๊อกทั้งหมด</span><strong>{pieces.filter(unit => unit.status !== "retired").length.toLocaleString("th-TH")}<small>ชิ้น</small></strong><p>พร้อมเช่า {pieces.filter(unit => unit.status === "available").length.toLocaleString("th-TH")} ชิ้น · กำลังเตรียม {pieces.filter(unit => prepStatuses.includes(unit.status)).length.toLocaleString("th-TH")} ชิ้น · ไม่พร้อมเช่า {pieces.filter(unit => unit.status === "unavailable").length.toLocaleString("th-TH")} ชิ้น</p></article>
        <article><span>ต้นทุนรวม (บาท)</span><strong>{money(pieces.reduce((sum, unit) => sum + (unit.cost ?? 0), 0))}</strong><p>รวมต้นทุนของทุกชิ้น</p></article>
      </section>
      {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
      {error && !draft && !restock && <p className="admin-error" role="alert">{error}</p>}
      <section className="admin-catalog">
        <div className="admin-catalog-heading"><h2>ข้อมูลสินค้า <span>{products.length}</span></h2><span className="admin-muted">หน่วยเงิน: บาท · เลื่อนตารางเพื่อดูทุกคอลัมน์</span></div>
        <div className="admin-filters flex flex-wrap items-center gap-3">
          <label className="admin-search"><span aria-hidden="true"><Icon name="search" /></span><Input aria-label="ค้นหาสินค้า" placeholder="ค้นหารหัสสินค้า รหัสชิ้น หรือชื่อสินค้า…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
          <Select label="ประเภทสินค้า" value={category} onValueChange={value => { setCategory(value); setPage(0); }} options={[{ value: "all", label: "ทุกประเภท" }, ...categories.map(c => ({ value: c, label: categoryLabels[c] || c }))]} />
          <Select label="สต๊อก" value={stockFilter} onValueChange={value => { setStockFilter(value); setPage(0); }} options={[{ value: "all", label: "ทุกสต๊อก" }, { value: "in", label: "มีชิ้นพร้อมเช่า" }, { value: "out", label: "ไม่มีชิ้นพร้อมเช่า" }]} />
        </div>
        <div className="admin-table-wrap inventory-table-scroll" tabIndex={0} role="region" aria-label="ตารางข้อมูลสินค้า เลื่อนซ้ายขวาเพื่อดูทุกคอลัมน์"><table className="admin-table inventory-table">
          <thead><tr><th>รูปสินค้า</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>ประเภท</th><th>สต๊อก</th><th className="inventory-money">ราคาเช่า</th><th>หน้าร้าน</th><th className="inventory-money">ต้นทุนรวม</th><th className="inventory-money">รายได้</th><th className="inventory-money">กำไร</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
          <tbody>{paginated.map(p => { const units = unitsOf(p).filter(unit => unit.status !== "retired"); return <tr key={p.id}>
            <td><Button variant="ghost" className="inventory-thumbnail" onClick={() => setPreview(p)} aria-label={`ดูรูป ${p.sku || p.name}`}><Image unoptimized src={p.images[0]} alt={p.name} width={48} height={64} /><span aria-hidden="true"><Icon name="expand" /></span></Button></td>
            <td className="inventory-sku">{p.sku || "—"}</td><td className="inventory-name"><strong>{p.name}</strong><small className="inventory-unit-codes">{units.map(unit => unit.sku).join(", ")}</small></td><td>{categoryLabels[p.category] || p.category}</td>
            <td><span className="inventory-stock"><strong>{units.length} ชิ้น</strong><small>พร้อมเช่า {ready(p)}</small></span></td>
            <td className="inventory-money">{p.customPricing?.tiers.length || p.dailyRate != null ? <span className="inventory-price"><strong>{p.customPricing?.tiers.length ? `${startingTier(p.customPricing)!.days} วัน ${money(startingTier(p.customPricing)!.price)}` : `วันละ ${money(p.dailyRate)}`}</strong><small>ราคาเฉพาะ</small></span> : <span className="inventory-price"><small>ตามตารางร้าน</small></span>}</td><td><span className={`inventory-status ${p.active === false ? "is-hidden" : ""}`}>{p.active === false ? "ซ่อน" : "แสดง"}</span></td>
            <td className="inventory-money">{money(p.cost)}</td><td className="inventory-money">{money(p.legacyRevenue)}</td><td className={`inventory-money ${(p.legacyProfit ?? 0) < 0 ? "inventory-loss" : "inventory-profit"}`}>{money(p.legacyProfit)}</td>
            <td className="inventory-notes">{p.notes || p.description || "—"}</td>
            <td><span className="inventory-actions"><Link href={`/admin/availability?productId=${p.id}`} className="inventory-calendar-link">ปฏิทินเช่า</Link><Button variant="outline" size="sm" aria-label={`เติมสต๊อก ${p.name}`} onClick={() => { setError(""); setNotice(""); setRestock({ product: p, variantId: p.variants?.[0]?.id, count: 1, cost: p.variants?.[0]?.cost ?? null, note: "" }); }}><Icon name="plus" />เติมสต๊อก</Button><Button variant="outline" size="sm" aria-label={`แก้ไข ${p.name}`} onClick={() => edit(p)}>แก้ไข</Button>{p.active === false && <Button variant="outline" size="sm" aria-label={`ลบสินค้า ${p.name}`} onClick={() => void removeProduct(p)}>ลบสินค้า</Button>}</span></td>
          </tr>; })}</tbody>
        </table>{!shown.length && <div className="admin-empty"><strong>ไม่พบสินค้า</strong><p>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p><Button onClick={() => { setQuery(""); setCategory("all"); setStockFilter("all"); setPage(0); }}>ล้างตัวกรอง</Button></div>}</div>
        <div className="admin-table-footer"><span>แสดง {paginated.length} จาก {shown.length} รายการ</span><span className="admin-pagination"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="arrowLeft" />ก่อนหน้า</Button>หน้า {currentPage + 1} / {pageCount}<Button variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>ถัดไป<Icon name="arrowRight" /></Button></span></div>
      </section>
    </main>
    <Dialog.Root open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-preview"><Dialog.Title>{preview?.name}</Dialog.Title><Dialog.Description>{preview?.sku || "ไม่มีรหัสสินค้า"} · {preview ? unitsOf(preview).length : 0} ชิ้น</Dialog.Description>{preview && <><Image unoptimized src={preview.images[0]} alt={preview.name} width={900} height={1100} /><a href={preview.images[0]} target="_blank" rel="noopener noreferrer">เปิดไฟล์รูปจาก R2<Icon name="arrow" /></a></>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดรูปสินค้า"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!restock} onOpenChange={open => { if (!open && !busy) { setRestock(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-restock"><Dialog.Title>เติมสต๊อก</Dialog.Title><Dialog.Description>{restock?.product.name} · ตอนนี้มี {restock ? unitsOf(restock.product).filter(unit => unit.status !== "retired").length : 0} ชิ้น</Dialog.Description>{restock && <form onSubmit={addStock}><div className="admin-form-grid">
      {restock.product.variants?.length ? <label>สี/ไซซ์<select value={restock.variantId || ""} required onChange={e => { const variant = restock.product.variants?.find(item => item.id === e.target.value); setRestock({ ...restock, variantId: e.target.value, cost: variant?.cost ?? null }); }}>{restock.product.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.color || "ไม่ระบุสี"} / {variant.size || "ไม่ระบุไซซ์"}</option>)}</select></label> : null}
      <label>จำนวนที่เติม (ชิ้น)<Input type="number" min="1" max="50" step="1" required value={restock.count} onChange={e => setRestock({ ...restock, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
      <label>ต้นทุนต่อชิ้น (บาท)<Input type="number" min="0" step="0.01" value={restock.cost ?? ""} placeholder="ไม่ระบุ" onChange={e => setRestock({ ...restock, cost: numeric(e.target) })} /></label>
      <label className="admin-form-full">หมายเหตุ<Input maxLength={500} value={restock.note} placeholder="เช่น ล็อตใหม่ ต.ค. / รอของถึง 25/10" onChange={e => setRestock({ ...restock, note: e.target.value })} /></label>
      <p className="admin-form-full inventory-next-codes">รหัสชิ้นที่จะสร้าง: <strong>{nextCodes(restock.product, restock.count, restock.variantId).join(", ")}</strong></p>
    </div>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setRestock(null); setError(""); }}>ยกเลิก</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : `เติม ${restock.count} ชิ้น`}</Button></div></form>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดหน้าต่าง" disabled={busy}><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!draft} onOpenChange={open => { if (!open && !busy) { setDraft(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-editor"><Dialog.Title>{draft?.id ? "แก้ไขข้อมูลสินค้า" : "เพิ่มสินค้าใหม่"}</Dialog.Title><Dialog.Description>{draft?.id ? "ข้อมูลสินค้าใช้ร่วมกันทุกชิ้น ต้นทุนและสถานะแก้ได้รายชิ้นด้านล่าง" : "ระบบสร้างรหัสสินค้าและรหัสชิ้นให้อัตโนมัติเมื่อบันทึก ถ้าเป็นชุดที่มีอยู่แล้ว ให้ใช้ปุ่ม “เติมสต๊อก” แทน"}</Dialog.Description>{draft && <form onSubmit={save}><div className="admin-form-grid">
      <label>รหัสสินค้า<Input maxLength={50} value={draft.sku} placeholder="เว้นว่างเพื่อสร้างอัตโนมัติ" onChange={e => setDraft({ ...draft, sku: e.target.value.toUpperCase() })} /><small className="inventory-help">รหัสชิ้นจะรันต่อท้ายอัตโนมัติ เช่น รหัสสินค้า-01, รหัสสินค้า-02</small></label>
      <label>ประเภท<Select label="ประเภท" value={draft.category} onValueChange={value => setDraft({ ...draft, category: value })} options={Array.from(new Set([...categories, draft.category])).map(c => ({ value: c, label: categoryLabels[c] || c }))} /></label>
      <label className="admin-form-full">ชื่อสินค้า<Input required maxLength={300} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      {!draft.id && <><label>จำนวนชิ้นเริ่มต้น<Input type="number" min="1" max="50" step="1" required value={draft.pieces} onChange={e => setDraft({ ...draft, pieces: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
      <label>ต้นทุนต่อชิ้น (บาท)<Input type="number" min="0" step="0.01" value={draft.cost ?? ""} placeholder="ไม่ระบุ" onChange={e => setDraft({ ...draft, cost: numeric(e.target) })} /></label></>}
      <label>เงินมัดจำ (บาท)<Input type="number" min="0" step="0.01" value={draft.deposit ?? ""} placeholder="ไม่ระบุ" onChange={e => setDraft({ ...draft, deposit: numeric(e.target) })} /></label>
      <label className="admin-form-full flex flex-row items-center gap-2"><Input type="checkbox" checked={draft.depositRequired} onChange={e => setDraft({ ...draft, depositRequired: e.target.checked })} />สินค้านี้ต้องมีมัดจำเสมอ <small className="inventory-help">เปิดแล้วลูกค้าจะไม่สามารถเลือกยืนยันตัวตนแทนมัดจำได้</small></label>
      <label>ค่าส่งพัสดุเฉพาะสินค้า (บาท)<Input type="number" min="0" step="1" value={draft.shippingFee ?? ""} placeholder="ใช้ค่าส่งปกติ" onChange={e => { const value = numeric(e.target); setDraft({ ...draft, shippingFee: value === null ? null : Math.round(value) }); }} /><small className="inventory-help">ของชิ้นใหญ่ เช่น The North Face 80 บาท · ใช้เป็นค่าส่งขั้นต่ำของคำขอที่มีสินค้านี้</small></label>
      <label>Gap พักชุดของสินค้านี้ (วัน)<Input type="number" min="0" max="14" step="1" value={draft.gapDays ?? ""} placeholder="เว้นว่าง = ค่าเริ่มต้น 2 วัน" onChange={e => { const value = numeric(e.target); setDraft({ ...draft, gapDays: value === null ? null : Math.max(0, Math.min(14, Math.round(value))) }); }} /><small className="inventory-help">ใส่ 0 ได้ = ไม่เพิ่มวันพักชุด หากเว้นว่างจะใช้ค่าตามวิธีคืนของร้าน</small></label>
      <div className="admin-form-full inventory-pricing"><label className="flex flex-row items-center gap-2"><Input type="checkbox" checked={draft.custom} onChange={e => setDraft({ ...draft, custom: e.target.checked })} />ตั้งราคาเฉพาะสินค้านี้ (ไม่ใช้ตารางราคาของร้าน)</label>{draft.custom ? <PriceTiersEditor extraHint="เว้นว่าง = ใช้ค่าส่วนเกินของร้าน (ตามหมวด)" rows={draft.tierRows} extra={draft.extra} onChange={(tierRows, extra) => setDraft({ ...draft, tierRows, extra })} /> : <small>ใช้ราคาตามตาราง <a href="/admin/rental-pricing" target="_blank" rel="noopener noreferrer">ราคาเช่ามาตรฐานของร้าน</a></small>}</div>
      {!draft.id && <div className="admin-form-full inventory-variants"><strong>ตัวเลือกสี/ไซซ์และสต๊อก</strong><small className="inventory-help">แต่ละสี/ไซซ์ใช้รูปได้ 1 รูป หากอัปโหลดใหม่จะทับรูปเดิม</small>{draft.variants.map((variant, index) => <div className="inventory-variant-row" key={variant.id}><label>สี<select value={`${variant.color}::${variant.colorCode}`} onChange={e => { const [color, colorCode] = e.target.value.split("::"); setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, color, colorCode } : item) }); }}><option value="::">เลือกสี</option>{colorOptions.map(option => <option key={`${option.color}:${option.colorCode}`} value={`${option.color}::${option.colorCode}`}>{option.color} ({option.colorCode})</option>)}</select></label><label>ไซซ์<Input maxLength={100} value={variant.size} onChange={e => setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, size: e.target.value } : item) })} /></label><label>จำนวน<Input type="number" min="1" max="50" value={variant.count} onChange={e => setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) } : item) })} /></label><label>ต้นทุน/ชิ้น<Input type="number" min="0" step="0.01" value={variant.cost ?? ""} onChange={e => setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, cost: numeric(e.target) } : item) })} /></label><label className="admin-form-full">รูปเฉพาะสี/ไซซ์<Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void uploadVariant(index, e.target.files?.[0]); e.target.value = ""; }} /></label>{variant.images.length > 0 && <div className="inventory-variant-images">{variant.images.map(image => <Image key={image} unoptimized src={image} alt="รูปตัวเลือก" width={52} height={66} />)}</div>}{draft.variants.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, variants: draft.variants.filter((_, at) => at !== index) })}>ลบตัวเลือก</Button>}</div>)}<Button type="button" variant="outline" onClick={addVariant}>+ เพิ่มสี/ไซซ์</Button></div>}
      {draft.id && <><label>สีรวม<Input maxLength={1000} value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} /></label><label>ไซซ์รวม<Input maxLength={1000} value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value })} /></label><div className="admin-form-full inventory-variant-summary"><strong>ตัวเลือกสี/ไซซ์และสต๊อก</strong><small className="inventory-help">จำนวนเป็นยอดรวมจากชิ้นสินค้าจริง หากต้องการเพิ่มจำนวนให้ใช้ปุ่ม “เติมสต๊อก” ด้านล่าง</small>{draft.variants.map((variant, index) => <div className="inventory-variant-row" key={variant.id}><label>สี<select value={`${variant.color}::${variant.colorCode}`} onChange={e => { const [color, colorCode] = e.target.value.split("::"); setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, color, colorCode } : item) }); }}>{colorOptions.map(option => <option key={`${option.color}:${option.colorCode}`} value={`${option.color}::${option.colorCode}`}>{option.color} ({option.colorCode})</option>)}</select></label><label>ไซซ์<Input maxLength={100} value={variant.size} onChange={e => setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, size: e.target.value } : item) })} /></label><span className="inventory-variant-count">จำนวนรวม {variant.count} ชิ้น</span><label>ต้นทุน/ชิ้น<Input type="number" min="0" step="0.01" value={variant.costMixed ? "" : variant.cost ?? ""} placeholder={variant.costMixed ? "หลายต้นทุน" : undefined} onChange={e => setDraft({ ...draft, variants: draft.variants.map((item, at) => at === index ? { ...item, cost: numeric(e.target), costMixed: false } : item) })} /></label><label className="admin-form-full">รูปเฉพาะสี/ไซซ์<Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void uploadVariant(index, e.target.files?.[0]); e.target.value = ""; }} /></label>{variant.costMixed && <small className="inventory-help">สีนี้มีต้นทุนหลายค่า ระบบจะรักษาต้นทุนรายชิ้นเดิมไว้ หากไม่กรอกค่าใหม่</small>}{variant.images.length > 0 && <div className="inventory-variant-images">{variant.images.map(image => <Image key={image} unoptimized src={image} alt={`รูป ${variant.color || "ตัวเลือก"}`} width={52} height={66} />)}</div>}{draft.variants.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, variants: draft.variants.filter((_, at) => at !== index) })}>ลบสี/ไซซ์</Button>}</div>)}<Button type="button" variant="outline" onClick={addVariant}>+ เพิ่มสี/ไซซ์</Button></div></>}
      <label className="admin-form-full flex flex-row items-center gap-2"><Input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />แสดงสินค้านี้บนหน้าร้าน</label>
      <label className="admin-form-full">หมายเหตุ<Textarea rows={3} maxLength={3000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <div className="admin-form-full inventory-gallery"><span>รูปสินค้า (รูปแรกเป็นรูปหลัก)</span><div>{draft.images.map((url, index) => <figure key={url}><Image unoptimized src={url} alt={`รูปที่ ${index + 1}`} width={84} height={108} />{index > 0 && <button type="button" aria-label="ตั้งเป็นรูปหลัก" title="ตั้งเป็นรูปหลัก" onClick={() => setDraft({ ...draft, images: [url, ...draft.images.filter(item => item !== url)] })}><Icon name="spark" /></button>}<button type="button" aria-label={`ลบรูปที่ ${index + 1}`} title="ลบรูป" disabled={draft.images.length === 1} onClick={() => setDraft({ ...draft, images: draft.images.filter(item => item !== url) })}><Icon name="close" /></button></figure>)}</div><Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || draft.images.length >= 12} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /><small>อัปโหลด PNG, JPG หรือ WebP ไม่เกิน 5 MB สูงสุด 12 รูป</small></div>
      {original && <div className="admin-form-full inventory-units"><div className="inventory-units-head"><span>ชิ้นสินค้า ({unitsOf(original).length} ชิ้น · พร้อมเช่า {ready(original)})</span><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setDraft(null); setRestock({ product: original, variantId: original.variants?.[0]?.id, count: 1, cost: original.variants?.[0]?.cost ?? null, note: "" }); }}><Icon name="plus" />เติมสต๊อก</Button></div>
        <table><thead><tr><th>รหัสชิ้น</th><th>จำนวนชิ้น</th><th>ต้นทุน</th><th>สถานะ</th><th>หมายเหตุ</th><th><span className="admin-sr-only">บันทึก</span></th></tr></thead><tbody>{unitsOf(original).map(saved => { const unit = unitEdits[saved.sku] || saved; const dirty = !!unitEdits[saved.sku]; const change = (patch: Partial<ProductUnit>) => setUnitEdits(current => ({ ...current, [saved.sku]: { ...unit, ...patch } })); return <tr key={saved.sku} className={unit.status === "retired" ? "is-retired" : undefined}>
          <td className="inventory-sku">{saved.sku}</td>
          <td>1 ชิ้น</td>
          <td><input type="number" min="0" step="0.01" aria-label={`ต้นทุน ${saved.sku}`} value={unit.cost ?? ""} onChange={e => change({ cost: numeric(e.target) })} /></td>
          <td><select aria-label={`สถานะ ${saved.sku}`} value={unit.status} onChange={e => change({ status: e.target.value as UnitStatus })}>{Object.entries(unitStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
          <td><input maxLength={500} aria-label={`หมายเหตุ ${saved.sku}`} value={unit.note} onChange={e => change({ note: e.target.value })} placeholder="—" /></td>
          <td>{dirty && <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => saveUnit(original, unit)}>บันทึก</Button>}<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => deleteUnit(original, saved)}>ลบ</Button></td>
        </tr>; })}</tbody></table>
        <small>“ไม่พร้อมเช่า” ใช้กับชิ้นที่ซ่อมหรือรอของ · “เลิกใช้แล้ว” ใช้กับชิ้นที่ขายหรือทิ้งไป ประวัติการเช่าของชิ้นนั้นยังเก็บไว้ครบ</small>
      </div>}
    </div>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>ปิด</Button><Button type="submit" variant="primary" disabled={busy || !draft.images.length}>{busy ? "กำลังบันทึก…" : draft.id ? "บันทึกข้อมูลสินค้า" : `เพิ่มสินค้า ${draft.pieces} ชิ้น`}</Button></div></form>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดหน้าต่าง" disabled={busy}><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={categoryDialog} onOpenChange={open => { if (!busy) setCategoryDialog(open); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-category-dialog"><Dialog.Title>จัดการหมวดหมู่สินค้า</Dialog.Title><Dialog.Description>หมวดหมู่ที่มีอยู่แล้วจะแสดงด้านล่าง และสามารถเพิ่มหมวดใหม่ได้</Dialog.Description><div className="inventory-category-list">{categories.map(item => <span key={item}>{item}</span>)}</div><form onSubmit={event => { event.preventDefault(); void addCategory(); }}><label>ชื่อหมวดหมู่ใหม่<Input autoFocus maxLength={100} value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="เช่น ชุดเด็ก" /></label>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setCategoryDialog(false)}>ยกเลิก</Button><Button type="submit" variant="primary" disabled={busy || !categoryName.trim()}>{busy ? "กำลังบันทึก…" : "เพิ่มหมวดหมู่"}</Button></div></form><Dialog.Close className="admin-dialog-close" aria-label="ปิดหน้าต่าง"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
