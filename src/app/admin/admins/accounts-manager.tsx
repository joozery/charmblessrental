"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allPermissions, permissionList, permissionPresets, type Permission } from "@/lib/permissions";
import "./accounts.css";

type Account = { _id: string; email?: string; username: string; name: string; role: "owner" | "admin"; permissions: Permission[]; active: boolean; createdAt: string | Date };
type Draft = { id?: string; email: string; name: string; password: string; confirm: string; active: boolean; permissions: Permission[]; owner: boolean };
type Filter = "all" | "active" | "inactive";
const empty: Draft = { email: "", name: "", password: "", confirm: "", active: true, permissions: ["products"], owner: false };
const sameSet = (a: Permission[], b: Permission[]) => a.length === b.length && a.every(item => b.includes(item));
const roleLabel = (account: Account) => account.role === "owner" ? "เจ้าของร้าน" : permissionPresets.find(preset => sameSet(preset.permissions, account.permissions))?.label || `กำหนดเอง ${account.permissions.length} สิทธิ์`;
const dateLabel = (value: string | Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value));

export default function AccountsManager({ initialAccounts, currentId }: { initialAccounts: Account[]; currentId: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function edit(account?: Account) {
    setError(""); setNotice("");
    setDraft(account ? { id: account._id, email: account.email || "", name: account.name, active: account.active, password: "", confirm: "", permissions: account.permissions, owner: account.role === "owner" } : { ...empty });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (draft.password !== draft.confirm) { setError("รหัสผ่านและการยืนยันไม่ตรงกัน"); return; }
    if (!draft.owner && !draft.permissions.length) { setError("กรุณาเลือกสิทธิ์อย่างน้อย 1 รายการ"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, email: draft.email, name: draft.name, password: draft.password, active: draft.active, permissions: draft.owner ? allPermissions : draft.permissions }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      if (draft.id === currentId) { router.replace("/admin/login"); router.refresh(); return; }
      setAccounts(result.accounts); setDraft(null); setNotice("บันทึกบัญชีแล้ว ใช้ชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้เข้าสู่ระบบได้");
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  const activeCount = accounts.filter(account => account.active).length;
  const inactiveCount = accounts.length - activeCount;
  const normalizedQuery = query.trim().toLowerCase();
  const visible = accounts.filter(account => (filter === "all" || account.active === (filter === "active")) && `${account.email || ""} ${account.username} ${account.name}`.toLowerCase().includes(normalizedQuery));
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "ทั้งหมด", count: accounts.length },
    { value: "active", label: "เปิดใช้งาน", count: activeCount },
    { value: "inactive", label: "ปิดใช้งาน", count: inactiveCount },
  ];

  return <>
    <main className="admin-main accounts-page">
      <header className="accounts-header"><div><p className="accounts-eyebrow">TEAM & ACCESS</p><h1>จัดการแอดมิน</h1><p>จัดการบัญชีและสิทธิ์เข้าถึงพื้นที่หลังบ้านของร้าน</p></div><Button className="accounts-add-button" onClick={() => edit()}><Icon name="plus" />เพิ่มแอดมิน</Button></header>
      <section className="accounts-overview" aria-label="ภาพรวมบัญชีแอดมิน">
        <article className="accounts-stat"><span className="accounts-stat-icon is-total"><Icon name="users" /></span><div><span>บัญชีทั้งหมด</span><strong>{accounts.length.toLocaleString("th-TH")}</strong></div></article>
        <article className="accounts-stat"><span className="accounts-stat-icon is-active"><Icon name="success" /></span><div><span>เปิดใช้งาน</span><strong>{activeCount.toLocaleString("th-TH")}</strong></div></article>
        <article className="accounts-stat"><span className="accounts-stat-icon is-inactive"><Icon name="shield" /></span><div><span>ปิดใช้งาน</span><strong>{inactiveCount.toLocaleString("th-TH")}</strong></div></article>
      </section>
      {notice && <p className="accounts-notice is-success" role="status"><Icon name="success" />{notice}</p>}
      {error && !draft && <p className="accounts-notice is-error" role="alert">{error}</p>}
      {accounts.some(account => !account.email) && <p className="accounts-notice is-migration"><Icon name="help" /><span>บัญชีเดิมบางรายการยังไม่มีอีเมล กด “แก้ไข” เพื่อเพิ่มอีเมลสำหรับเข้าสู่ระบบ</span></p>}
      <div className="accounts-layout">
        <section className="accounts-panel" aria-labelledby="accounts-list-title">
          <div className="accounts-panel-heading"><div><p className="accounts-section-label">ACCOUNT DIRECTORY</p><h2 id="accounts-list-title">บัญชีผู้ดูแล <span>{accounts.length.toLocaleString("th-TH")}</span></h2><p>ค้นหาและจัดการบัญชีที่เข้าถึงระบบหลังบ้าน</p></div></div>
          <div className="accounts-toolbar"><label className="accounts-search"><Icon name="search" /><span className="admin-sr-only">ค้นหาชื่อหรือชื่อผู้ใช้</span><Input placeholder="ค้นหาชื่อหรือชื่อผู้ใช้…" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="accounts-filters" aria-label="กรองตามสถานะ">{filters.map(item => <button key={item.value} type="button" className={filter === item.value ? "is-selected" : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.count.toLocaleString("th-TH")}</span></button>)}</div></div>
          <div className="accounts-list-head" aria-hidden="true"><span>บัญชี</span><span>สิทธิ์</span><span>สถานะ</span><span>จัดการ</span></div>
          <div className="accounts-list">{visible.map(account => <article className="accounts-row" key={account._id}>
            <div className="accounts-person"><span className={`accounts-avatar ${account.role === "owner" ? "is-owner" : ""}`}>{(account.name || account.email || account.username).trim().slice(0, 1).toUpperCase()}</span><div><strong>{account.name}</strong><span>{account.email || "ยังไม่ได้ตั้งค่าอีเมล"}{account._id === currentId && <em>คุณ</em>}</span><small>เพิ่มเมื่อ {dateLabel(account.createdAt)}</small></div></div>
            <div className="accounts-role"><span className={account.role === "owner" ? "is-owner" : ""}><Icon name={account.role === "owner" ? "shield" : "users"} />{roleLabel(account)}</span></div>
            <div className="accounts-status"><span className={account.active ? "is-active" : "is-inactive"}><i />{account.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span></div>
            <Button variant="outline" size="sm" className="accounts-edit" onClick={() => edit(account)} aria-label={`แก้ไข ${account.username}`}>แก้ไข<Icon name="arrowRight" /></Button>
          </article>)}{!visible.length && <div className="accounts-empty"><span><Icon name="search" /></span><strong>ไม่พบบัญชี</strong><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p></div>}</div>
          <div className="accounts-panel-foot">แสดง {visible.length.toLocaleString("th-TH")} จาก {accounts.length.toLocaleString("th-TH")} บัญชี</div>
        </section>
        <aside className="accounts-side" aria-label="ข้อมูลสิทธิ์ผู้ดูแล">
          <section className="accounts-info-card"><span className="accounts-info-icon"><Icon name="shield" /></span><p className="accounts-section-label">ACCESS LEVELS</p><h2>สิทธิ์การใช้งาน</h2><p className="accounts-info-intro">แบ่งหน้าที่ของผู้ดูแลร้านตามประเภทบัญชี</p><div className="accounts-permission"><span className="accounts-permission-mark is-owner"><Icon name="shield" /></span><div><strong>เจ้าของร้าน</strong><p>เข้าถึงทุกเมนู และจัดการบัญชีแอดมินได้คนเดียว</p></div></div><div className="accounts-permission"><span className="accounts-permission-mark"><Icon name="users" /></span><div><strong>แอดมิน</strong><p>เห็นเฉพาะเมนูและทำได้เฉพาะรายการที่เจ้าของร้านติ๊กสิทธิ์ให้</p></div></div></section>
          <section className="accounts-tip"><Icon name="help" /><div><strong>การเข้าถึงระบบ</strong><p>บัญชีที่ปิดใช้งานจะเข้าสู่ระบบไม่ได้ หากแก้ไขบัญชีที่กำลังใช้อยู่ ระบบจะให้เข้าสู่ระบบใหม่</p></div></section>
        </aside>
      </div>
    </main>
    <Dialog.Root open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null); }}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay" /><Dialog.Content className="admin-dialog accounts-dialog">
      <span className="accounts-dialog-icon"><Icon name={draft?.id ? "users" : "plus"} /></span><Dialog.Title>{draft?.id ? "แก้ไขบัญชีแอดมิน" : "เพิ่มแอดมิน"}</Dialog.Title><Dialog.Description>กำหนดข้อมูลบัญชีสำหรับเข้าสู่ระบบหลังบ้าน</Dialog.Description>
      {draft && <form onSubmit={save}>
        <div className="accounts-form-section"><span>ข้อมูลบัญชี</span><div className="admin-form-grid"><label>อีเมลสำหรับเข้าสู่ระบบ<Input type="email" required maxLength={254} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /><small>ใช้รับรองตัวตนเมื่อเข้าสู่ระบบ</small></label><label>ชื่อที่แสดง<Input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label></div></div>
        <div className="accounts-form-section"><span>ความปลอดภัย</span><div className="admin-form-grid"><label>{draft.id ? "รหัสผ่านใหม่ (เว้นว่างเพื่อใช้เดิม)" : "รหัสผ่าน"}<Input type="password" autoComplete="new-password" required={!draft.id} minLength={8} maxLength={128} value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })} /></label><label>ยืนยันรหัสผ่าน<Input type="password" autoComplete="new-password" required={!!draft.password} value={draft.confirm} onChange={event => setDraft({ ...draft, confirm: event.target.value })} /></label></div></div>
        <div className="accounts-form-section"><span>สิทธิ์การใช้งาน</span>{draft.owner ? <p className="accounts-form-hint"><Icon name="shield" />บัญชีเจ้าของร้านเข้าถึงได้ทุกเมนูเสมอ</p> : <>
          <div className="accounts-presets" aria-label="ชุดสิทธิ์สำเร็จรูป">{permissionPresets.map(preset => <button type="button" key={preset.label} className={sameSet(preset.permissions, draft.permissions) ? "is-selected" : ""} onClick={() => setDraft({ ...draft, permissions: [...preset.permissions] })}>{preset.label}</button>)}</div>
          <div className="accounts-permission-grid">{permissionList.map(item => <label key={item.key} className="accounts-permission-option"><input type="checkbox" checked={draft.permissions.includes(item.key)} onChange={event => setDraft({ ...draft, permissions: event.target.checked ? [...draft.permissions, item.key] : draft.permissions.filter(key => key !== item.key) })} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div>
        </>}</div>
        <label className="admin-checkbox accounts-active-toggle"><Input type="checkbox" checked={draft.active} disabled={accounts.some(account => account._id === draft.id && account.role === "owner")} onChange={event => setDraft({ ...draft, active: event.target.checked })} /><span><strong>เปิดใช้งานบัญชี</strong><small>อนุญาตให้บัญชีนี้เข้าสู่ระบบหลังบ้าน</small></span></label>
        {draft.id && <p className="accounts-form-hint"><Icon name="help" />เมื่อบันทึก บัญชีนี้ต้องเข้าสู่ระบบใหม่อีกครั้ง</p>}{error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>ยกเลิก</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกบัญชี"}</Button></div>
      </form>}<Dialog.Close className="admin-dialog-close" disabled={busy} aria-label="ปิดหน้าต่าง"><Icon name="close" /></Dialog.Close>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
