"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { identityFileKinds, type IdentityFileKind } from "@/lib/identity";

// Phone photos are 3–10 MB; shrink to a 1600px JPEG in the browser so the upload is small and fast.
async function shrink(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ")), "image/jpeg", 0.85));
}

export default function IdentityForm({ token, defaults, deleteAfterDays, examples }: { token: string; defaults: { fullName: string }; deleteAfterDays: number; examples: Record<IdentityFileKind, string> }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: defaults.fullName });
  const [files, setFiles] = useState<Partial<Record<IdentityFileKind, { blob: Blob; url: string }>>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function choose(kind: IdentityFileKind, file?: File) {
    if (!file) return;
    setError("");
    try { const blob = await shrink(file); setFiles(current => ({ ...current, [kind]: { blob, url: URL.createObjectURL(blob) } })); }
    catch { setError("เปิดรูปนี้ไม่ได้ กรุณาเลือกรูป JPG หรือ PNG"); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (identityFileKinds.some(kind => !files[kind.key])) { setError("กรุณาแนบรูปให้ครบทั้ง 2 รูป"); return; }
    setBusy(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      data.append("consent", consent ? "yes" : "no");
      identityFileKinds.forEach(kind => data.append(kind.key, files[kind.key]!.blob, `${kind.key}.jpg`));
      const response = await fetch(`/api/bill/${token}/identity`, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ส่งเอกสารไม่สำเร็จ");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ส่งเอกสารไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return <form className="bill-identity-form" onSubmit={submit}>
    <label className="is-wide">ชื่อ-นามสกุล (ตามบัตรประชาชน) *<input required maxLength={120} value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} /></label>
    {identityFileKinds.map(kind => <div key={kind.key} className="bill-identity-file"><label>{kind.label} *<input type="file" accept="image/*" onChange={event => void choose(kind.key, event.target.files?.[0])} /></label><span>{kind.hint}</span>{files[kind.key] ? <img src={files[kind.key]!.url} alt={kind.label} /> : examples[kind.key] && <a href={examples[kind.key]} target="_blank" rel="noopener noreferrer" className="bill-identity-example"><img src={examples[kind.key]} alt={`ตัวอย่าง${kind.label}`} /><small>ตัวอย่าง (แตะเพื่อดูภาพใหญ่)</small></a>}</div>)}
    <label className="bill-identity-consent is-wide"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />ยินยอมให้ร้านเก็บข้อมูลและรูปนี้เพื่อยืนยันตัวตนสำหรับการเช่านี้ เฉพาะแอดมินที่ได้รับสิทธิ์เปิดดูได้ และร้านจะลบรูปอัตโนมัติ {deleteAfterDays} วันหลังจบการเช่า</label>
    {error && <p className="bill-error is-wide" role="alert">{error}</p>}
    <div className="is-wide"><button type="submit" className="bill-button is-primary" disabled={busy || !consent}>{busy ? "กำลังส่ง…" : "ส่งเอกสารยืนยันตัวตน"}</button></div>
  </form>;
}
