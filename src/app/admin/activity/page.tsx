import { Suspense } from "react";
import Link from "next/link";
import type { Filter } from "mongodb";
import { Icon } from "@/components/ui/icon";
import { pageAdmin } from "@/lib/admin-auth";
import { listAdmins } from "@/lib/admin-accounts";
import { auditLogs, type AuditLog } from "@/lib/audit";
import { actionGroups, actionLabels, fieldLabels, showValue } from "@/lib/audit-labels";
import "./activity.css";

export const metadata = { title: "ประวัติการทำรายการ | Charm Bless", robots: { index: false, follow: false } };
type Query = { group?: string | string[]; actor?: string | string[]; q?: string | string[]; from?: string | string[]; to?: string | string[] };
const one = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value) || "";
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`));
// Days are Bangkok calendar days (UTC+7).
const bangkokStart = (day: string) => new Date(Date.parse(`${day}T00:00:00+07:00`));
const stamp = (value: Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" }).format(value);
const targetLink = (row: AuditLog) => row.targetType === "booking" && row.targetId ? `/admin/bookings?id=${encodeURIComponent(row.targetId)}` : "";

async function Content({ searchParams }: { searchParams: Promise<Query> }) {
  await pageAdmin("activity");
  const query = await searchParams;
  const group = actionGroups.some(item => item.key === one(query.group)) ? one(query.group) : "";
  const actor = one(query.actor).slice(0, 100), q = one(query.q).trim().slice(0, 100);
  const from = validDay(one(query.from)) ? one(query.from) : "", to = validDay(one(query.to)) ? one(query.to) : "";
  const filter: Filter<AuditLog> = {};
  if (group) filter.action = { $in: Object.entries(actionLabels).filter(([, item]) => item.group === group).map(([key]) => key) };
  if (actor) filter.actorId = actor;
  if (q) filter.$or = [{ targetId: q.toUpperCase() }, { targetId: q }, { actorEmail: q.toLowerCase() }];
  if (from || to) filter.at = { ...(from ? { $gte: bangkokStart(from) } : {}), ...(to ? { $lt: new Date(bangkokStart(to).getTime() + 86400000) } : {}) };
  const [rows, admins] = await Promise.all([(await auditLogs()).find(filter).sort({ at: -1 }).limit(300).toArray(), listAdmins()]);
  const failedLogins = rows.filter(row => row.action === "auth.login_failed").length;

  return <main className="admin-main activity-page">
    <header className="activity-header"><div><span className="activity-eyebrow">AUDIT TRAIL</span><h1>ประวัติการทำรายการ</h1><p>บันทึกว่าใครทำอะไร เมื่อใด กับรายการใด รวมถึงการเข้าและออกจากระบบ แก้ไขหรือลบไม่ได้</p></div></header>
    <form className="activity-filters" action="/admin/activity" method="get">
      <label>หมวด<select name="group" defaultValue={group}><option value="">ทั้งหมด</option>{actionGroups.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>ผู้ดำเนินการ<select name="actor" defaultValue={actor}><option value="">ทุกคน</option>{admins.map(item => <option key={item._id} value={item._id}>{item.name}{item.email ? ` (${item.email})` : ""}</option>)}</select></label>
      <label>ค้นหา<input name="q" defaultValue={q} placeholder="เลขที่คำขอ / อีเมล" maxLength={100} /></label>
      <label>ตั้งแต่<input type="date" name="from" defaultValue={from} /></label>
      <label>ถึง<input type="date" name="to" defaultValue={to} /></label>
      <button type="submit"><Icon name="search" />กรอง</button>
      {(group || actor || q || from || to) && <Link href="/admin/activity">ล้างตัวกรอง</Link>}
    </form>
    <p className="activity-count">{rows.length.toLocaleString("th-TH")} รายการ{rows.length === 300 ? " (แสดงล่าสุด 300 รายการ กรุณากรองเพิ่ม)" : ""}{failedLogins ? ` · เข้าสู่ระบบไม่สำเร็จ ${failedLogins.toLocaleString("th-TH")} ครั้ง` : ""}</p>
    {rows.length ? <ol className="activity-list">{rows.map(row => {
      const link = targetLink(row);
      return <li key={row._id} className={`activity-item is-${actionLabels[row.action]?.group || "other"}${row.action === "auth.login_failed" ? " is-failed" : ""}`}>
        <div className="activity-item-head"><span className="activity-badge">{actionLabels[row.action]?.label || row.action}</span><strong>{row.summary}</strong><time dateTime={row.at.toISOString()}>{stamp(row.at)}</time></div>
        <p className="activity-meta"><span><Icon name="users" />{row.actorName || "ไม่ทราบผู้ใช้"}{row.actorEmail ? ` · ${row.actorEmail}` : ""}</span>{row.targetId && row.targetType !== "admin" && <span>รายการ: {link ? <Link href={link}>{row.targetId}</Link> : row.targetId}</span>}{row.ip && <span>IP {row.ip}</span>}</p>
        {!!row.changes.length && <table className="activity-changes"><thead><tr><th>ข้อมูล</th><th>ก่อนแก้ไข</th><th>หลังแก้ไข</th></tr></thead><tbody>{row.changes.map(change => <tr key={change.field}><td>{fieldLabels[change.field] || change.field}</td><td>{showValue(change.before)}</td><td>{showValue(change.after)}</td></tr>)}</tbody></table>}
      </li>;
    })}</ol> : <p className="activity-empty">ยังไม่มีประวัติที่ตรงกับตัวกรอง</p>}
  </main>;
}

export default function Page({ searchParams }: { searchParams: Promise<Query> }) {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดประวัติการทำรายการ…</main>}><Content searchParams={searchParams} /></Suspense>;
}
