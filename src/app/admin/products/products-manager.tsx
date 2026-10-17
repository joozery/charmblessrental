"use client";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { categoryLabels, type Product } from "@/lib/products";

type Draft = {
  id?: number; sku: string; name: string; category: string;
  cost: number | null; inventoryStatus: string; description: string; imageUrl: string;
};
const empty: Draft = { sku: "", name: "", category: "เสื้อ", cost: null, inventoryStatus: "อยู่ที่ร้าน", description: "", imageUrl: "" };
const money = (value?: number | null) => value == null ? "—" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const numeric = (input: HTMLInputElement) => Number.isNaN(input.valueAsNumber) ? null : input.valueAsNumber;
export default function AdminProducts({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialProducts);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const products = items;
  const categories = Array.from(new Set(products.map(p => p.category))).sort((a,b) => a.localeCompare(b,"th"));
  const statuses = Array.from(new Set(products.map(p => p.inventoryStatus).filter((s): s is string => !!s)));
  const shown = products.filter(p => `${p.name} ${p.legacyId || ""} ${p.sku || ""} ${p.category} ${p.notes || p.description}`.toLowerCase().includes(query.trim().toLowerCase()) && (category === "all" || p.category === category) && (status === "all" || p.inventoryStatus === status));
  const pageCount = Math.max(1, Math.ceil(shown.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const paginated = shown.slice(currentPage * 30, (currentPage + 1) * 30);
  const original = draft?.id ? products.find(p => p.id === draft.id) : undefined;
  function edit(product?: Product) {
    setError(""); setNotice("");
    setDraft(product ? { id: product.id, sku: product.sku || "", name: product.name, category: product.category, cost: product.cost ?? null, inventoryStatus: product.inventoryStatus || "", description: product.notes ?? product.description, imageUrl: product.images[0] } : { ...empty });
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    setBusy(true); setError("");
    try {
      const data = new FormData(); data.append("image", file);
      const response = await fetch("/api/admin/images", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "อัปโหลดไม่สำเร็จ");
      setDraft(current => current ? { ...current, imageUrl: result.url } : null);
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      setItems(result.products); setDraft(null); setNotice("บันทึกข้อมูลสินค้าเรียบร้อยแล้ว"); startTransition(() => router.refresh());
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  return <>
    <main className="admin-main inventory-page">
      <div className="admin-page-title"><div><h1>ข้อมูลสินค้า</h1><p>รหัสสินค้า รูปภาพ และข้อมูลตามแท็บ “ข้อมูลสินค้า”</p></div><Button variant="primary" onClick={() => edit()}><Icon name="plus" />เพิ่มสินค้า</Button></div>
      <section className="admin-stats grid gap-4 md:grid-cols-3" aria-label="ภาพรวมข้อมูลสินค้า">
        <article><span>สินค้าทั้งหมด</span><strong>{products.length}<small>รายการ</small></strong><p>แยกรายชิ้นตาม Product ID เดิม</p></article>
        <article><span>ต้นทุนรวม (บาท)</span><strong>{money(products.reduce((sum,p) => sum + (p.cost ?? 0), 0))}</strong><p>จากคอลัมน์ต้นทุน</p></article>
        <article><span>รายได้สะสม (บาท)</span><strong>{money(products.reduce((sum,p) => sum + (p.legacyRevenue ?? 0), 0))}</strong><p>ยอดรายได้ที่บันทึกไว้ในไฟล์เดิม</p></article>
      </section>
      {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
      {error && !draft && <p className="admin-error" role="alert">{error}</p>}
      <section className="admin-catalog">
        <div className="admin-catalog-heading"><h2>ข้อมูลสินค้า <span>{products.length}</span></h2><span className="admin-muted">หน่วยเงิน: บาท · เลื่อนตารางเพื่อดูทุกคอลัมน์</span></div>
        <div className="admin-filters flex flex-wrap items-center gap-3">
          <label className="admin-search"><span aria-hidden="true"><Icon name="search" /></span><Input aria-label="ค้นหาสินค้า" placeholder="ค้นหา Product ID รหัสสินค้า หรือชื่อสินค้า…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
          <Select label="ประเภทสินค้า" value={category} onValueChange={value => { setCategory(value); setPage(0); }} options={[{value:"all",label:"ทุกประเภท"}, ...categories.map(c => ({value:c,label:categoryLabels[c] || c}))]} />
          <Select label="สถานะปัจจุบัน" value={status} onValueChange={value => { setStatus(value); setPage(0); }} options={[{value:"all",label:"ทุกสถานะปัจจุบัน"}, ...statuses.map(s => ({value:s,label:s}))]} />
        </div>
        <div className="admin-table-wrap inventory-table-scroll" tabIndex={0} role="region" aria-label="ตารางข้อมูลสินค้า เลื่อนซ้ายขวาเพื่อดูทุกคอลัมน์"><table className="admin-table inventory-table">
          <thead><tr><th>Product ID</th><th>รูปสินค้า</th><th>ประเภท</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th className="inventory-money">ต้นทุน</th><th className="inventory-money">รายได้</th><th className="inventory-money">กำไร</th><th>หมายเหตุ</th><th>สถานะปัจจุบัน</th><th>Image URL</th><th>จัดการ</th></tr></thead>
          <tbody>{paginated.map(p => <tr key={p.id}>
            <td className="inventory-id">{p.legacyId || "—"}</td>
            <td><Button variant="ghost" className="inventory-thumbnail" onClick={() => setPreview(p)} aria-label={`ดูรูป ${p.sku || p.name}`}><Image unoptimized src={p.images[0]} alt={p.name} width={48} height={64} /><span aria-hidden="true"><Icon name="expand" /></span></Button></td>
            <td>{categoryLabels[p.category] || p.category}</td><td className="inventory-sku">{p.sku || "—"}</td><td className="inventory-name"><strong>{p.name}</strong></td>
            <td className="inventory-money">{money(p.cost)}</td><td className="inventory-money">{money(p.legacyRevenue)}</td><td className={`inventory-money ${(p.legacyProfit ?? 0) < 0 ? "inventory-loss" : "inventory-profit"}`}>{money(p.legacyProfit)}</td>
            <td className="inventory-notes">{p.notes || p.description || "—"}</td><td><span className="inventory-status">{p.inventoryStatus || "—"}</span></td><td>{p.imageStatus === "missing-source" ? <span className="admin-muted">ไม่มีรูปเดิม</span> : <a className="inventory-image-link" href={p.images[0]} target="_blank" rel="noopener noreferrer">เปิดรูป<Icon name="arrow" /></a>}</td>
            <td><Button variant="outline" size="sm" aria-label={`แก้ไข ${p.sku || p.name}`} onClick={() => edit(p)}>แก้ไข</Button></td>
          </tr>)}</tbody>
        </table>{!shown.length && <div className="admin-empty"><strong>ไม่พบสินค้า</strong><p>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p><Button onClick={() => { setQuery(""); setCategory("all"); setStatus("all"); setPage(0); }}>ล้างตัวกรอง</Button></div>}</div>
        <div className="admin-table-footer"><span>แสดง {paginated.length} จาก {shown.length} รายการ</span><span className="admin-pagination"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="arrowLeft" />ก่อนหน้า</Button>หน้า {currentPage + 1} / {pageCount}<Button variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>ถัดไป<Icon name="arrowRight" /></Button></span></div>
      </section>
    </main>
    <Dialog.Root open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-preview"><Dialog.Title>{preview?.name}</Dialog.Title><Dialog.Description>{preview?.legacyId} · {preview?.sku || "ไม่มีรหัสสินค้า"}</Dialog.Description>{preview && <><Image unoptimized src={preview.images[0]} alt={preview.name} width={900} height={1100} /><a href={preview.images[0]} target="_blank" rel="noopener noreferrer">เปิดไฟล์รูปจาก R2<Icon name="arrow" /></a></>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดรูปสินค้า"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!draft} onOpenChange={open => { if (!open && !busy) { setDraft(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog inventory-editor"><Dialog.Title>{draft?.id ? "แก้ไขข้อมูลสินค้า" : "เพิ่มข้อมูลสินค้า"}</Dialog.Title><Dialog.Description>ข้อมูลหลักตรงกับแท็บ “ข้อมูลสินค้า” ในไฟล์เดิม</Dialog.Description>{draft && <form onSubmit={save}><div className="admin-form-grid">
      <label>Product ID<Input readOnly value={original?.legacyId || "สร้างอัตโนมัติเมื่อบันทึก"} /></label>
      <label>รหัสสินค้า<Input maxLength={150} value={draft.sku} onChange={e => setDraft({ ...draft, sku: e.target.value })} /></label>
      <label className="admin-form-full">ชื่อสินค้า<Input required maxLength={300} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>ประเภท<Select label="ประเภท" value={draft.category} onValueChange={value => setDraft({...draft,category:value})} options={Array.from(new Set([...categories,draft.category])).map(c => ({value:c,label:categoryLabels[c] || c}))} /></label>
      <label>ต้นทุน (บาท)<Input type="number" min="0" step="0.01" value={draft.cost ?? ""} placeholder="ไม่ระบุ" onChange={e => setDraft({ ...draft, cost: numeric(e.target) })} /></label>
      <label>รายได้สะสม (จากต้นฉบับ)<Input readOnly value={money(original?.legacyRevenue)} /></label><label>กำไร (จากต้นฉบับ)<Input readOnly value={money(original?.legacyProfit)} /></label>
      <label className="admin-form-full">สถานะปัจจุบัน<Input readOnly value={draft.inventoryStatus} /></label>
      <label className="admin-form-full">หมายเหตุ<Textarea rows={3} maxLength={3000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label className="admin-form-full">รูปสินค้า<Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => upload(e.target.files?.[0])} /><small>อัปโหลด PNG, JPG หรือ WebP ไม่เกิน 5 MB</small>{draft.imageUrl && <Image unoptimized src={draft.imageUrl} alt="ตัวอย่างรูปสินค้า" width={120} height={150} style={{ objectFit: "contain", width: 120, height: 150, borderRadius: 8 }} />}</label>
      <label className="admin-form-full">Image URL<Input required value={draft.imageUrl} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} /><small>ลิงก์รูปที่จัดเก็บใน Cloudflare R2</small></label>
    </div>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>ยกเลิก</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}</Button></div></form>}<Dialog.Close className="admin-dialog-close" aria-label="ปิดหน้าต่าง" disabled={busy}><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
