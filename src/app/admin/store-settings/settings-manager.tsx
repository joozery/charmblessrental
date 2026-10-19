"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { StoreSettings } from "@/lib/store-settings";
import type { ImageKey } from "./components/types";
import { SectionNav } from "./components/section-nav";
import { BrandSection } from "./components/brand-section";
import { HowToSection } from "./components/how-to-section";
import { ContactSection } from "./components/contact-section";
import { RulesSection } from "./components/rules-section";
import { StorePreview } from "./components/store-preview";

export default function SettingsManager({ initial }: { initial: StoreSettings }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState<ImageKey | null>(null);
  const update = (patch: Partial<StoreSettings>) => setSettings(current => ({ ...current, ...patch }));
  async function uploadImage(key: ImageKey, file?: File) {
    if (!file) return;
    setUploading(key); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("image", file);
      const response = await fetch("/api/admin/store-settings/images", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");
      setSettings(current => ({ ...current, [key]: data.url }));
      setNotice("อัปโหลดรูปไปยัง Cloudflare R2 แล้ว กดบันทึกการตั้งค่าเพื่อใช้บนหน้าร้าน");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "อัปโหลดไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setUploading(null); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/store-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setSettings(data.settings); setNotice("บันทึกการตั้งค่าหน้าร้านแล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  return <main className="admin-main store-settings-page">
    <header className="store-settings-header"><div><span className="store-settings-eyebrow">STOREFRONT CONTENT</span><h1>ตั้งค่าหน้าร้าน</h1><p>แก้ไขข้อความ รูปภาพ ช่องทางติดต่อ และเงื่อนไขที่ลูกค้าเห็นบนเว็บไซต์</p></div></header>
    {notice && <p className="admin-success" role="status"><Icon name="success" />{notice}</p>}{error && <p className="admin-error" role="alert">{error}</p>}
    <SectionNav />
    <div className="store-settings-layout"><form id="store-settings-form" onSubmit={save} className="store-settings-form">
      <BrandSection settings={settings} update={update} uploading={uploading} onUpload={uploadImage} />
      <HowToSection settings={settings} update={update} />
      <ContactSection settings={settings} update={update} />
      <RulesSection settings={settings} update={update} />
      <div className="store-settings-bottom"><Button type="submit" disabled={busy || uploading !== null}><Icon name="check" />{busy ? "กำลังบันทึก…" : uploading ? "กำลังอัปโหลดรูป…" : "บันทึกการตั้งค่า"}</Button></div>
    </form><StorePreview settings={settings} /></div>
  </main>;
}
