"use client";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { categoryLabels, unitStatusLabels, unitsOf, type Product, type ProductUnit, type UnitStatus } from "@/lib/products";

type Draft = {
  id?: number; name: string; category: string; description: string; images: string[];
  color: string; size: string; dailyRate: number | null; deposit: number | null; active: boolean;
  pieces: number; cost: number | null;
};
type Restock = { product: Product; count: number; cost: number | null; note: string };
const empty: Draft = { name: "", category: "เสื้อ", description: "", images: [], color: "", size: "", dailyRate: null, deposit: null, active: true, pieces: 1, cost: null };
const money = (value?: number | null) => value == null ? "—" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const numeric = (input: HTMLInputElement) => Number.isNaN(input.valueAsNumber) ? null : input.valueAsNumber;
const nextCodes = (product: Product, count: number) => {
  const code = product.sku || "";
  const last = Math.max(0, ...unitsOf(product).map(unit => unit.sku.startsWith(`${code}-`) ? Number(unit.sku.slice(code.length + 1)) || 0 : 0));
  return Array.from({ length: Math.min(count, 50) }, (_, index) => `${code}-${String(last + index + 1).padStart(2, "0")}`);
};
async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
  return result as { products: Product[] };
}

export default function AdminProducts({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialProducts);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restock, setRestock] = useState<Restock | null>(null);
  const [unitEdits, setUnitEdits] = useState<Record<string, ProductUnit>>({});
  const [preview, setPreview] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const products = items;
  const categories = Array.from(new Set(products.map(p => p.category))).sort((a, b) => a.localeCompare(b, "th"));
  const pieces = products.flatMap(p => unitsOf(p));
  const shown = products.filter(p => `${p.name} ${p.sku || ""} ${unitsOf(p).map(unit => unit.sku).join(" ")} ${p.category} ${p.notes || p.description}`.toLowerCase().includes(query.trim().toLowerCase()) && (category === "all" || p.category === category) && (stockFilter === "all" || (stockFilter === "in" ? (p.stock ?? 0) > 0 : (p.stock ?? 0) === 0)));
  const pageCount = Math.max(1, Math.ceil(shown.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const paginated = shown.slice(currentPage * 30, (currentPage + 1) * 30);
  const original = draft?.id ? products.find(p => p.id === draft.id) : undefined;

  function done(result: { products: Product[] }, message: string) {
    setItems(result.products); setNotice(message); startTransition(() => router.refresh());
  }
  function edit(product?: Product) {
    setError(""); setNotice(""); setUnitEdits({});
    setDraft(product ? { id: product.id, name: product.name, category: product.category, description: product.notes ?? product.description, images: product.images, color: product.color || "", size: product.size || "", dailyRate: product.dailyRate ?? null, deposit: product.deposit ?? null, active: product.active !== false, pieces: 0, cost: null } : { ...empty });
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    setBusy(true); setError("");
    try {
      const data = new FormData(); data.append("image", file);
      const response = await fetch("/api/admin/images", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "อัปโหลดไม่สำเร็จ");
      setDraft(current => current ? { ...current, images: [...current.images, result.url] } : null);
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setError("");
    try {
      const { id, pieces: count, cost, ...fields } = draft;
      const result = await post("/api/admin/products", id ? { id, ...fields } : { ...fields, pieces: count, cost });
      setDraft(null); done(result, id ? "บันทึกข้อมูลสินค้าเรียบร้อยแล้ว" : `เพิ่มสินค้าใหม่ ${count} ชิ้นแล้ว ระบบสร้างรหัสให้อัตโนมัติ`);
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  async function addStock(event: React.FormEvent) {
    event.preventDefault(); if (!restock) return;
    setBusy(true); setError("");
    try {
      const result = await post("/api/admin/products/units", { action: "add", productId: restock.product.id, count: restock.count, cost: restock.cost, note: restock.note });
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

  return <>
    <main className="admin-main inventory-page">
      <div className="admin-page-title"><div><h1>ข้อมูลสินค้า</h1><p>สินค้าแต่ละรายการมีได้หลายชิ้น รหัสสินค้าและรหัสชิ้นสร้างอัตโนมัติ กด “เติมสต๊อก” เมื่อได้ชุดเดิมมาเพิ่ม</p></div><Button variant="primary" onClick={() => edit()}><Icon name="plus" />เพิ่มสินค้าใหม่</Button></div>
      <section className="admin-stats grid gap-4 md:grid-cols-3" aria-label="ภาพรวมข้อมูลสินค้า">
        <article><span>สินค้าทั้งหมด</span><strong>{products.length.toLocaleString("th-TH")}<small>รายการ</small></strong><p>รวมชุดเดียวกันไว้เป็นรายการเดียว</p></article>
        <article><span>สต๊อกทั้งหมด</span><strong>{pieces.filter(unit => unit.status !== "retired").length.toLocaleString("th-TH")}<small>ชิ้น</small></strong><p>พร้อมเช่า {pieces.filter(unit => unit.status === "available").length.toLocaleString("th-TH")} ชิ้น · ไม่พร้อมเช่า {pieces.filter(unit => unit.status === "unavailable").length.toLocaleString("th-TH")} ชิ้น</p></article>
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
          <thead><tr><th>รูปสินค้า</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>ประเภท</th><th>สต๊อก</th><th className="inventory-money">ราคาเช่า/วัน</th><th>หน้าร้าน</th><th className="inventory-money">ต้นทุนรวม</th><th className="inventory-money">รายได้</th><th className="inventory-money">กำไร</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
          <tbody>{paginated.map(p => { const units = unitsOf(p).filter(unit => unit.status !== "retired"); return <tr key={p.id}>
            <td><Button variant="ghost" className="inventory-thumbnail" onClick={() => setPreview(p)} aria-label={`ดูรูป ${p.sku || p.name}`}><Image unoptimized src={p.images[0]} alt={p.name} width={48} height={64} /><span aria-hidden="true"><Icon name="expand" /></span></Button></td>
            <td className="inventory-sku">{p.sku || "—"}</td><td className="inventory-name"><strong>{p.name}</strong><small className="inventory-unit-codes">{units.map(unit => unit.sku).join(", ")}</small></td><td>{categoryLabels[p.category] || p.category}</td>
            <td><span className="inventory-stock"><strong>{units.length} ชิ้น</strong><small>พร้อมเช่า {p.stock ?? 0}</small></span></td>
            <td className="inventory-money">{p.dailyRate == null ? "สอบถาม" : money(p.dailyRate)}</td><td><span className={`inventory-status ${p.active === false ? "is-hidden" : ""}`}>{p.active === false ? "ซ่อน" : "แสดง"}</span></td>
            <td className="inventory-money">{money(p.cost)}</td><td className="inventory-money">{money(p.legacyRevenue)}</td><td className={`inventory-money ${(p.legacyProfit ?? 0) < 0 ? "inventory-loss" : "inventory-profit"}`}>{money(p.legacyProfit)}</td>
            <td className="inventory-notes">{p.notes || p.description || "—"}</td>
            <td><span className="inventory-actions"><Button variant="outline" size="sm" aria-label={`เติมสต๊อก ${p.name}`} onClick={() => { setError(""); setNotice(""); setRestock({ product: p, count: 1, cost: null, note: "" }); }}><Icon name="plus" />เติมสต๊อก</Button><Button variant="outline" size="sm" aria-label={`แก้ไข ${p.name}`} onClick={() => edit(p)}>แก้ไข</Button></span></td>
          </tr>; })}</tbody>
        </table>{!shown.length && <div className="admin-empty"><strong>ไม่พบสินค้า</strong><p>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p><Button onClick={() => { setQuery(""); setCategory("all"); setStockFilter("all"); setPage(0); }}>ล้างตัวกรอง</Button></div>}</div>
        <div className="admin-table-footer"><span>แสดง {paginated.length} จาก {shown.length} รายการ</span><span className="admin-pagination"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="arrowLeft" />ก่อนหน้า</Button>หน้า {currentPage + 1} / {pageCount}<Button variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>ถัดไป<Icon name="arrowRight" /></Button></span></div>
      </section>
    </main>
    <Dialog.Root open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-preview"><Dialog.Title>{preview?.name}</Dialog.Title><Dialog.Description>{preview?.sku || "ไม่มีรหัสสินค้า"} · {preview ? unitsOf(preview).length : 0} ชิ้น</Dialog.Description>{preview && <><Image unoptimized src={preview.images[0]} alt={preview.name} width={900} height={1100} /><a href={preview.images[0]} target="_blank" rel="noopener noreferrer">เปิดไฟล์รูปจาก R2<Icon name="arrow" /></a></>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดรูปสินค้า"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!restock} onOpenChange={open => { if (!open && !busy) { setRestock(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-restock"><Dialog.Title>เติมสต๊อก</Dialog.Title><Dialog.Description>{restock?.product.name} · ตอนนี้มี {restock ? unitsOf(restock.product).filter(unit => unit.status !== "retired").length : 0} ชิ้น</Dialog.Description>{restock && <form onSubmit={addStock}><div className="admin-form-grid">
      <label>จำนวนที่เติม (ชิ้น)<Input type="number" min="1" max="50" step="1" required value={restock.count} onChange={e => setRestock({ ...restock, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
      <label>ต้นทุนต่อชิ้น (บาท)<Input type="number" min="0" step="0.01" value={restock.cost ?? ""} placeholder="ไม่ระบุ" onChange={e => setRestock({ ...restock, cost: numeric(e.target) })} /></label>
      <label className="admin-form-full">หมายเหตุ<Input maxLength={500} value={restock.note} placeholder="เช่น ล็อตใหม่ ต.ค. / รอของถึง 25/10" onChange={e => setRestock({ ...restock, note: e.target.value })} /></label>
      <p className="admin-form-full inventory-next-codes">รหัสชิ้นที่จะสร้าง: <strong>{nextCodes(restock.product, restock.count).join(", ")}</strong></p>
    </div>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setRestock(null); setError(""); }}>ยกเลิก</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : `เติม ${restock.count} ชิ้น`}</Button></div></form>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดหน้าต่าง" disabled={busy}><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!draft} onOpenChange={open => { if (!open && !busy) { setDraft(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-editor"><Dialog.Title>{draft?.id ? "แก้ไขข้อมูลสินค้า" : "เพิ่มสินค้าใหม่"}</Dialog.Title><Dialog.Description>{draft?.id ? "ข้อมูลสินค้าใช้ร่วมกันทุกชิ้น ต้นทุนและสถานะแก้ได้รายชิ้นด้านล่าง" : "ระบบสร้างรหัสสินค้าและรหัสชิ้นให้อัตโนมัติเมื่อบันทึก ถ้าเป็นชุดที่มีอยู่แล้ว ให้ใช้ปุ่ม “เติมสต๊อก” แทน"}</Dialog.Description>{draft && <form onSubmit={save}><div className="admin-form-grid">
      <label>รหัสสินค้า<Input readOnly value={original?.sku || "สร้างอัตโนมัติเมื่อบันทึก"} /></label>
      <label>ประเภท<Select label="ประเภท" value={draft.category} onValueChange={value => setDraft({ ...draft, category: value })} options={Array.from(new Set([...categories, draft.category])).map(c => ({ value: c, label: categoryLabels[c] || c }))} /></label>
      <label className="admin-form-full">ชื่อสินค้า<Input required maxLength={300} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      {!draft.id && <><label>จำนวนชิ้นเริ่มต้น<Input type="number" min="1" max="50" step="1" required value={draft.pieces} onChange={e => setDraft({ ...draft, pieces: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
      <label>ต้นทุนต่อชิ้น (บาท)<Input type="number" min="0" step="0.01" value={draft.cost ?? ""} placeholder="ไม่ระบุ" onChange={e => setDraft({ ...draft, cost: numeric(e.target) })} /></label></>}
      <label>ราคาเช่าต่อวัน (บาท)<Input type="number" min="0" step="0.01" value={draft.dailyRate ?? ""} placeholder="เว้นว่าง = สอบถามราคา" onChange={e => setDraft({ ...draft, dailyRate: numeric(e.target) })} /></label>
      <label>เงินมัดจำ (บาท)<Input type="number" min="0" step="0.01" value={draft.deposit ?? ""} placeholder="ไม่ระบุ" onChange={e => setDraft({ ...draft, deposit: numeric(e.target) })} /></label>
      <label>สี<Input maxLength={100} value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} /></label>
      <label>ไซซ์<Input maxLength={100} value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value })} /></label>
      <label className="admin-form-full flex flex-row items-center gap-2"><Input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />แสดงสินค้านี้บนหน้าร้าน</label>
      <label className="admin-form-full">หมายเหตุ<Textarea rows={3} maxLength={3000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <div className="admin-form-full inventory-gallery"><span>รูปสินค้า (รูปแรกเป็นรูปหลัก)</span><div>{draft.images.map((url, index) => <figure key={url}><Image unoptimized src={url} alt={`รูปที่ ${index + 1}`} width={84} height={108} />{index > 0 && <button type="button" aria-label="ตั้งเป็นรูปหลัก" title="ตั้งเป็นรูปหลัก" onClick={() => setDraft({ ...draft, images: [url, ...draft.images.filter(item => item !== url)] })}><Icon name="spark" /></button>}<button type="button" aria-label={`ลบรูปที่ ${index + 1}`} title="ลบรูป" disabled={draft.images.length === 1} onClick={() => setDraft({ ...draft, images: draft.images.filter(item => item !== url) })}><Icon name="close" /></button></figure>)}</div><Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || draft.images.length >= 12} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /><small>อัปโหลด PNG, JPG หรือ WebP ไม่เกิน 5 MB สูงสุด 12 รูป</small></div>
      {original && <div className="admin-form-full inventory-units"><div className="inventory-units-head"><span>ชิ้นสินค้า ({unitsOf(original).length} ชิ้น · พร้อมเช่า {original.stock ?? 0})</span><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setDraft(null); setRestock({ product: original, count: 1, cost: null, note: "" }); }}><Icon name="plus" />เติมสต๊อก</Button></div>
        <table><thead><tr><th>รหัสชิ้น</th><th>ต้นทุน</th><th>สถานะ</th><th>หมายเหตุ</th><th><span className="admin-sr-only">บันทึก</span></th></tr></thead><tbody>{unitsOf(original).map(saved => { const unit = unitEdits[saved.sku] || saved; const dirty = !!unitEdits[saved.sku]; const change = (patch: Partial<ProductUnit>) => setUnitEdits(current => ({ ...current, [saved.sku]: { ...unit, ...patch } })); return <tr key={saved.sku} className={unit.status === "retired" ? "is-retired" : undefined}>
          <td className="inventory-sku">{saved.sku}</td>
          <td><input type="number" min="0" step="0.01" aria-label={`ต้นทุน ${saved.sku}`} value={unit.cost ?? ""} onChange={e => change({ cost: numeric(e.target) })} /></td>
          <td><select aria-label={`สถานะ ${saved.sku}`} value={unit.status} onChange={e => change({ status: e.target.value as UnitStatus })}>{Object.entries(unitStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
          <td><input maxLength={500} aria-label={`หมายเหตุ ${saved.sku}`} value={unit.note} onChange={e => change({ note: e.target.value })} placeholder="—" /></td>
          <td>{dirty && <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => saveUnit(original, unit)}>บันทึก</Button>}</td>
        </tr>; })}</tbody></table>
        <small>“ไม่พร้อมเช่า” ใช้กับชิ้นที่ซ่อมหรือรอของ · “เลิกใช้แล้ว” ใช้กับชิ้นที่ขายหรือทิ้งไป ประวัติการเช่าของชิ้นนั้นยังเก็บไว้ครบ</small>
      </div>}
    </div>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>ปิด</Button><Button type="submit" variant="primary" disabled={busy || !draft.images.length}>{busy ? "กำลังบันทึก…" : draft.id ? "บันทึกข้อมูลสินค้า" : `เพิ่มสินค้า ${draft.pieces} ชิ้น`}</Button></div></form>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดหน้าต่าง" disabled={busy}><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
