"use client";

import Link from "next/link";
import { useState } from "react";

export type CommissionRow = {
  id: string; customer: string; day: string; paid: boolean; ownerId: string; ownerName: string; reassignedBy: string;
  rental: number; discount: number; extras: number; adjusted: number; shipping: number; deposit: number; total: number;
};
type AdminOption = { id: string; name: string; active: boolean };
const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const dayLabel = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));
const none = "__none";

// Bills grouped by the admin they count for. "ยอดคิดค่าคอม" is rent after discount plus paid extensions, fines and
// edit differences; delivery and deposits are listed but left out, since they are not the shop's sales.
export default function CommissionTable({ rows: initial, admins, canAssign, fileName, open }: { rows: CommissionRow[]; admins: AdminOption[]; canAssign: boolean; fileName: string; open: boolean }) {
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const groups = [...new Map(rows.map(row => [row.ownerId || none, row.ownerName || "ยังไม่ระบุผู้ทำบิล"])).entries()]
    .map(([id, name]) => { const list = rows.filter(row => (row.ownerId || none) === id); return { id, name, count: list.length, rental: list.reduce((sum, row) => sum + row.rental, 0), total: list.reduce((sum, row) => sum + row.total, 0) }; })
    .sort((a, b) => a.id === none ? 1 : b.id === none ? -1 : b.total - a.total);
  const visible = selected ? rows.filter(row => (row.ownerId || none) === selected) : rows;
  const sum = (key: keyof CommissionRow) => visible.reduce((total, row) => total + (row[key] as number), 0);

  async function assign(row: CommissionRow, adminId: string) {
    setBusy(row.id); setError("");
    try {
      const response = await fetch("/api/admin/commissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: row.id, adminId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "เปลี่ยนผู้ทำบิลไม่สำเร็จ");
      setRows(current => current.map(item => item.id === row.id ? { ...item, ownerId: data.owner?.adminId || "", ownerName: data.owner?.name || "", reassignedBy: data.owner ? "คุณ" : "" } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เปลี่ยนผู้ทำบิลไม่สำเร็จ"); } finally { setBusy(""); }
  }
  function download() {
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [["เลขที่บิล", "ลูกค้า", open ? "วันที่บันทึกราคา" : "วันที่ชำระ", "ผู้ทำบิล", "ค่าเช่า (หลังส่วนลด)", "ส่วนลด", "เช่าต่อ/ค่าปรับ", "ส่วนต่างแก้ไข", "ยอดคิดค่าคอม", "ค่าส่ง", "เงินมัดจำ"],
      ...visible.map(row => [row.id, row.customer, dayLabel(row.day), row.ownerName || "ยังไม่ระบุ", row.rental, row.discount, row.extras, row.adjusted, row.total, row.shipping, row.deposit])];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.map(line => line.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${fileName}${selected ? `-${groups.find(group => group.id === selected)?.name || ""}` : ""}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <>
    <section className="commissions-cards" aria-label="ยอดตามแอดมิน">
      <button type="button" className={selected ? "" : "is-active"} onClick={() => setSelected("")}><span>ทุกคน</span><strong>{money(rows.reduce((total, row) => total + row.total, 0))} ฿</strong><small>{rows.length} บิล</small></button>
      {groups.map(group => <button type="button" key={group.id} className={`${selected === group.id ? "is-active" : ""}${group.id === none ? " is-none" : ""}`} onClick={() => setSelected(selected === group.id ? "" : group.id)}><span>{group.name}</span><strong>{money(group.total)} ฿</strong><small>{group.count} บิล · ค่าเช่า {money(group.rental)} ฿</small></button>)}
    </section>
    {error && <p className="commissions-error" role="alert">{error}</p>}
    <section className="commissions-panel">
      <div className="commissions-panel-head"><h2>{selected ? groups.find(group => group.id === selected)?.name : "ทุกบิล"} <small>{visible.length} บิล</small></h2><button type="button" onClick={download} disabled={!visible.length}>ดาวน์โหลด CSV</button></div>
      {visible.length ? <div className="commissions-scroll"><table>
        <thead><tr><th>เลขที่บิล</th><th>{open ? "บันทึกราคา" : "ชำระเมื่อ"}</th><th>ผู้ทำบิล</th><th>ค่าเช่า</th><th>เช่าต่อ / ค่าปรับ</th><th>ส่วนต่างแก้ไข</th><th>ยอดคิดค่าคอม</th><th>ค่าส่ง</th><th>มัดจำ</th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.id}>
          <td><Link href={`/admin/bookings?id=${encodeURIComponent(row.id)}`}>{row.id}</Link><small>{row.customer}</small></td>
          <td>{dayLabel(row.day)}</td>
          <td>{canAssign ? <select value={row.ownerId} disabled={busy === row.id} onChange={event => void assign(row, event.target.value)} aria-label={`ผู้ทำบิล ${row.id}`}><option value="">ยังไม่ระบุ</option>{admins.filter(item => item.active || item.id === row.ownerId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : row.ownerName || <span className="commissions-muted">ยังไม่ระบุ</span>}{row.reassignedBy && <small>เปลี่ยนโดย {row.reassignedBy}</small>}</td>
          <td>{money(row.rental)}{row.discount > 0 && <small>ลด {money(row.discount)}</small>}</td>
          <td>{row.extras ? money(row.extras) : "–"}</td>
          <td>{row.adjusted ? money(row.adjusted) : "–"}</td>
          <td><b>{money(row.total)}</b></td>
          <td className="commissions-muted">{money(row.shipping)}</td>
          <td className="commissions-muted">{money(row.deposit)}</td>
        </tr>)}</tbody>
        <tfoot><tr><td colSpan={3}>รวม {visible.length} บิล</td><td>{money(sum("rental"))}</td><td>{money(sum("extras"))}</td><td>{money(sum("adjusted"))}</td><td><b>{money(sum("total"))}</b></td><td>{money(sum("shipping"))}</td><td>{money(sum("deposit"))}</td></tr></tfoot>
      </table></div> : <p className="commissions-empty">{open ? "ไม่มีบิลที่รอชำระ" : "ไม่มีบิลที่ชำระในเดือนนี้"}</p>}
      <p className="commissions-note">ยอดคิดค่าคอม = ค่าเช่าหลังส่วนลด + ค่าเช่าต่อ/ค่าปรับที่ชำระแล้ว + ส่วนต่างจากการแก้ไขบิลที่ชำระหรือคืนแล้ว ไม่รวมค่าส่งและเงินมัดจำ{canAssign ? " · เจ้าของร้านเปลี่ยนผู้ทำบิลได้ที่ช่องผู้ทำบิล" : ""}</p>
    </section>
  </>;
}
