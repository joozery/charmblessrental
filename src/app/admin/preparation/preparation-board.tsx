"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { prepMoves } from "@/lib/preparation";
import { unitStatusLabels, type UnitStatus } from "@/lib/products";

export type PrepPiece = {
  sku: string; status: UnitStatus; note: string; productName: string; image: string;
  lastReturn: { bookingId: string; at: string; condition: string; note: string } | null;
  out: { bookingId: string; name: string; end: string } | null;
  next: { bookingId: string; name: string; start: string } | null;
};
const tabs: { key: UnitStatus | "todo"; label: string }[] = [{ key: "todo", label: "ต้องเตรียม" }, { key: "inspection", label: "รอตรวจสภาพ" }, { key: "washing", label: "รอซัก" }, { key: "repair", label: "รอซ่อม / ชำรุด" }, { key: "rented", label: "อยู่กับลูกค้า" }];
const conditionLabels: Record<string, string> = { good: "สภาพปกติ", damaged: "ชำรุด / มีคราบ", missing: "สูญหาย / ไม่ครบ" };
const day = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export default function PreparationBoard({ initial, today }: { initial: PrepPiece[]; today: string }) {
  const [pieces, setPieces] = useState(initial);
  const [tab, setTab] = useState<UnitStatus | "todo">("todo");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const count = (key: UnitStatus | "todo") => pieces.filter(piece => key === "todo" ? piece.status !== "rented" : piece.status === key).length;
  // Pieces a customer is waiting for come first.
  const shown = pieces.filter(piece => tab === "todo" ? piece.status !== "rented" : piece.status === tab).sort((a, b) => (a.next?.start || "9999").localeCompare(b.next?.start || "9999") || a.sku.localeCompare(b.sku));

  async function move(piece: PrepPiece, to: UnitStatus) {
    setBusy(piece.sku); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/preparation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: piece.sku, to, note: notes[piece.sku] || "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setPieces(current => to === "available" || to === "retired" ? current.filter(item => item.sku !== piece.sku) : current.map(item => item.sku === piece.sku ? { ...item, status: to, note: notes[piece.sku]?.trim() || item.note } : item));
      setNotes(current => ({ ...current, [piece.sku]: "" }));
      setNotice(`${piece.sku} → ${unitStatusLabels[to]}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(""); }
  }

  return <main className="admin-main prep-page">
    <header className="prep-header"><span className="prep-eyebrow">PREPARATION</span><h1>เตรียมสินค้าให้เช่ารอบถัดไป</h1><p>สินค้าที่รับคืนแล้วยังไม่พร้อมให้เช่าทันที ต้องตรวจสภาพ ซัก หรือซ่อมก่อน แล้วกดยืนยันพร้อมให้เช่า ลูกค้าคิวถัดไปจะเห็นสถานะการเตรียมสินค้าในลิงก์บิลของตน</p></header>
    <div className="prep-tabs" role="tablist">{tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)}>{item.label}<b>{count(item.key)}</b></button>)}</div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status"><Icon name="success" /> {notice}</p>}
    {shown.length ? <div className="prep-list">{shown.map(piece => {
      const wait = piece.next ? daysUntil(today, piece.next.start) : null;
      return <article key={piece.sku} className="prep-card">
        {piece.image ? <Image unoptimized src={piece.image} alt="" width={72} height={96} /> : <span className="prep-noimage" />}
        <div className="prep-body">
          <div className="prep-title"><strong>{piece.sku}</strong><span className={`prep-badge is-${piece.status}`}>{unitStatusLabels[piece.status]}</span></div>
          <p className="prep-name">{piece.productName}</p>
          {piece.next && <p className={`prep-next${wait !== null && wait <= 2 ? " is-urgent" : ""}`}><Icon name="calendar" />คิวถัดไป <Link href={`/admin/bookings?id=${encodeURIComponent(piece.next.bookingId)}`}>{piece.next.bookingId}</Link> · {piece.next.name} · ต้องส่ง {day(piece.next.start)}{wait !== null && (wait <= 0 ? " (วันนี้)" : ` (อีก ${wait} วัน)`)}</p>}
          {piece.out && <p className="prep-meta">อยู่กับลูกค้า <Link href={`/admin/bookings?id=${encodeURIComponent(piece.out.bookingId)}`}>{piece.out.bookingId}</Link> · {piece.out.name} · กำหนดคืน {day(piece.out.end)}</p>}
          {piece.lastReturn && <p className="prep-meta">รับคืนจาก <Link href={`/admin/bookings?id=${encodeURIComponent(piece.lastReturn.bookingId)}`}>{piece.lastReturn.bookingId}</Link> · {day(piece.lastReturn.at)} · {conditionLabels[piece.lastReturn.condition] || piece.lastReturn.condition}{piece.lastReturn.note ? ` · ${piece.lastReturn.note}` : ""}</p>}
          {piece.note && <p className="prep-meta">หมายเหตุ: {piece.note}</p>}
          {prepMoves[piece.status] && <div className="prep-actions">
            <input aria-label={`หมายเหตุ ${piece.sku}`} maxLength={500} placeholder="หมายเหตุ (ถ้ามี) เช่น คราบที่แขนเสื้อ" value={notes[piece.sku] || ""} onChange={event => setNotes(current => ({ ...current, [piece.sku]: event.target.value }))} />
            {prepMoves[piece.status]!.map(option => <button key={option.to} type="button" className={option.primary ? "is-primary" : option.to === "available" ? "is-ready" : ""} disabled={busy === piece.sku} onClick={() => move(piece, option.to)}>{busy === piece.sku ? "กำลังบันทึก…" : option.label}</button>)}
          </div>}
        </div>
      </article>;
    })}</div> : <div className="prep-empty"><Icon name="success" /><strong>{tab === "rented" ? "ไม่มีสินค้าที่อยู่กับลูกค้า" : "ไม่มีสินค้าที่ต้องเตรียม"}</strong><span>สินค้าที่รับคืนจะเข้ามาที่นี่อัตโนมัติ</span></div>}
  </main>;
}
