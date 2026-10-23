"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// The slip's QR code has to stay sharp: keep small files as they are, and shrink big phone photos only gently.
async function prepare(file: File) {
  if (file.size <= 2 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ")), "image/jpeg", 0.92));
}

export type SlipState = { status: "review" | "rejected" | "checking"; reason: string } | null;

export default function SlipForm({ token, last }: { token: string; last: SlipState }) {
  const router = useRouter();
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<SlipState>(last);
  // While the bank re-check runs, reload the bill now and then; the page keys this form on the slip state, so the result shows up.
  useEffect(() => {
    if (result?.status !== "checking") return;
    const timer = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(timer);
  }, [result?.status, router]);

  async function pick(input: HTMLInputElement) {
    const chosen = input.files?.[0]; input.value = ""; setError("");
    if (!chosen) return;
    try { const blob = await prepare(chosen); if (file) URL.revokeObjectURL(file.url); setFile({ blob, url: URL.createObjectURL(blob) }); }
    catch { setError("เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปสลิปใหม่"); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) { setError("กรุณาเลือกรูปสลิป"); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("slip", file.blob, "slip.jpg");
      const response = await fetch(`/api/bill/${token}/slip`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ส่งสลิปไม่สำเร็จ");
      URL.revokeObjectURL(file.url); setFile(null);
      if (data.status === "review" || data.status === "checking") setResult({ status: data.status, reason: data.reason || "" });
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ส่งสลิปไม่สำเร็จ"); } finally { setBusy(false); }
  }

  return <form className="bill-slip-form" onSubmit={submit}>
    {result?.status === "checking" && <p className="bill-slip-note">ร้านได้รับสลิปแล้ว ระบบกำลังตรวจสอบรายการกับธนาคาร ใช้เวลาไม่เกิน 5 นาที ไม่ต้องส่งสลิปซ้ำค่ะ</p>}
    {result?.status === "review" && <p className="bill-slip-note">ร้านได้รับสลิปแล้ว ระบบตรวจอัตโนมัติไม่ผ่าน ({result.reason}) ร้านจะตรวจและยืนยันให้อีกครั้งค่ะ</p>}
    {result?.status === "rejected" && <p className="bill-error">ร้านแจ้งว่าสลิปล่าสุดไม่ถูกต้อง: {result.reason} กรุณาแนบสลิปใหม่</p>}
    <label className="bill-slip-pick">{file ? <img src={file.url} alt="สลิปที่เลือก" /> : <span>แตะเพื่อเลือกรูปสลิปโอนเงิน</span>}<input type="file" accept="image/*" onChange={event => pick(event.currentTarget)} disabled={busy} /></label>
    <small>ใช้รูปสลิปเต็มใบที่เห็น QR Code ชัดเจน ระบบจะตรวจกับธนาคารและยืนยันการชำระให้ทันที</small>
    {error && <p className="bill-error" role="alert">{error}</p>}
    <button type="submit" className="bill-button is-primary" disabled={busy || !file}>{busy ? "กำลังตรวจสลิป…" : "ส่งสลิปและตรวจสอบ"}</button>
  </form>;
}
