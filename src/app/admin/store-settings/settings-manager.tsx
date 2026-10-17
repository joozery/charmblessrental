"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import type { StoreSettings } from "@/lib/store-settings";

type ImageKey = "logoImage" | "heroImage" | "promotionImage";

export default function SettingsManager({ initial }: { initial: StoreSettings }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState<ImageKey | null>(null);
  const lineRules = settings.rentalRules.join("\n");
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
  function imageField(label: string, key: ImageKey, required = false) {
    return <div className="store-image-field" key={key}>
      <label>{label}<Input value={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.value })} required={required} /></label>
      <label className="store-image-upload">อัปโหลดไฟล์จากเครื่อง<Input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading !== null} onChange={e => { void uploadImage(key, e.target.files?.[0]); e.currentTarget.value = ""; }} /><small>PNG, JPG หรือ WebP · ไม่เกิน 5 MB</small></label>
    </div>;
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
    <header className="store-settings-header"><div><span className="store-settings-eyebrow">STOREFRONT CONTENT</span><h1>ตั้งค่าหน้าร้าน</h1><p>แก้ไขข้อความ รูปภาพ ช่องทางติดต่อ และเงื่อนไขที่ลูกค้าเห็นบนเว็บไซต์</p></div><Button type="submit" form="store-settings-form" disabled={busy || uploading !== null}><Icon name="check" />{busy ? "กำลังบันทึก…" : uploading ? "กำลังอัปโหลดรูป…" : "บันทึกการตั้งค่า"}</Button></header>
    {notice && <p className="admin-success" role="status"><Icon name="success" />{notice}</p>}{error && <p className="admin-error" role="alert">{error}</p>}
    <div className="store-settings-layout"><form id="store-settings-form" onSubmit={save} className="store-settings-form">
      <section className="store-settings-card"><div><h2>โลโก้และแบนเนอร์</h2><p>ใส่ URL รูปเดิม หรือเลือกไฟล์เพื่ออัปโหลดขึ้น Cloudflare R2</p></div>{imageField("URL โลโก้", "logoImage", true)}{imageField("URL ภาพปกหลัก", "heroImage", true)}{imageField("URL ภาพโปรโมชั่น (เว้นว่างเพื่อซ่อน)", "promotionImage")}<label>หัวข้อหลักบนภาพปก<Textarea rows={2} value={settings.heroTitle} onChange={e => setSettings({ ...settings, heroTitle: e.target.value })} /><small>ขึ้นบรรทัดใหม่เพื่อแยกบรรทัด</small></label><label>ข้อความรองบนภาพปก<Textarea rows={2} value={settings.heroSubtitle} onChange={e => setSettings({ ...settings, heroSubtitle: e.target.value })} /><small>ขึ้นบรรทัดใหม่เพื่อแยกบรรทัด</small></label></section>
      <section className="store-settings-card"><div><h2>วิธีเช่าและติดต่อร้าน</h2><p>ปรับข้อความแนะนำลูกค้าและข้อมูลค่าจัดส่งที่หน้าแสดงสินค้า · ใช้ {"{{emsFee}}"} แทนจำนวนค่าส่ง EMS อัตโนมัติ</p></div><label>หัวข้อวิธีเช่า<Input value={settings.howTitle} onChange={e => setSettings({ ...settings, howTitle: e.target.value })} required /></label><div className="store-steps-grid">{settings.howSteps.map((step,index) => <fieldset key={index}><legend>ขั้นตอนที่ {index + 1}</legend><label>หัวข้อ<Input value={step.title} onChange={e => setSettings({ ...settings, howSteps: settings.howSteps.map((item,i) => i === index ? { ...item, title: e.target.value } : item) })} required /></label><label>คำอธิบาย<Input value={step.description} onChange={e => setSettings({ ...settings, howSteps: settings.howSteps.map((item,i) => i === index ? { ...item, description: e.target.value } : item) })} required /></label></fieldset>)}</div><label>ข้อความช่องทางจัดส่ง<Textarea rows={2} value={settings.shippingText} onChange={e => setSettings({ ...settings, shippingText: e.target.value })} /></label><label>ค่าจัดส่ง EMS (บาท)<Input type="number" min="0" step="1" value={settings.emsFee} onChange={e => setSettings({ ...settings, emsFee: Number(e.target.value) })} /></label><label>หัวข้อส่วนติดต่อ<Input value={settings.contactTitle} onChange={e => setSettings({ ...settings, contactTitle: e.target.value })} /></label><label>คำอธิบายส่วนติดต่อ<Input value={settings.contactDescription} onChange={e => setSettings({ ...settings, contactDescription: e.target.value })} /></label><label>ข้อความท้ายเว็บไซต์<Input value={settings.footerTagline} onChange={e => setSettings({ ...settings, footerTagline: e.target.value })} /></label></section>
      <section className="store-settings-card"><div><h2>ช่องทางโซเชียล</h2><p>ลิงก์เหล่านี้ใช้กับปุ่มติดต่อและไอคอนลอยบนหน้าร้าน</p></div><label>LINE URL<Input type="url" value={settings.lineUrl} onChange={e => setSettings({ ...settings, lineUrl: e.target.value })} /></label><label>Instagram URL<Input type="url" value={settings.instagramUrl} onChange={e => setSettings({ ...settings, instagramUrl: e.target.value })} /></label><label>Facebook URL<Input type="url" value={settings.facebookUrl} onChange={e => setSettings({ ...settings, facebookUrl: e.target.value })} /></label></section>
      <section className="store-settings-card"><div><h2>เงื่อนไขการเช่า</h2><p>แยกแต่ละข้อด้วยการขึ้นบรรทัดใหม่</p></div><label>รายการเงื่อนไข<Textarea rows={12} value={lineRules} onChange={e => setSettings({ ...settings, rentalRules: e.target.value.split("\n").filter(rule => rule.trim()) })} /></label></section>
      <div className="store-settings-bottom"><Button type="submit" disabled={busy || uploading !== null}><Icon name="check" />{busy ? "กำลังบันทึก…" : uploading ? "กำลังอัปโหลดรูป…" : "บันทึกการตั้งค่า"}</Button></div>
    </form><aside className="store-settings-preview" aria-label="ตัวอย่างหน้าร้าน"><div className="store-preview-heading"><div><span>LIVE PREVIEW</span><h2>ตัวอย่างหน้าร้าน</h2></div><span className="store-preview-badge"><i />ตัวอย่าง</span></div><div className="store-preview-browser"><div className="store-preview-toolbar"><i /><i /><i /><span>charmblessrental.com</span></div><div className="store-preview-site"><div className="store-preview-brand">{settings.logoImage && <Image src={settings.logoImage} alt="" width={30} height={30} unoptimized />}<strong>CHARM BLESS <small>RENTAL</small></strong></div><div className="store-preview-hero">{settings.heroImage && <Image src={settings.heroImage} alt="ตัวอย่างภาพปกหน้าร้าน" fill sizes="(max-width: 1000px) 100vw, 360px" unoptimized />}<div className="store-preview-hero-copy"><strong>{settings.heroTitle.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}{index < settings.heroTitle.split("\n").length - 1 && <br />}</span>)}</strong><small>{settings.heroSubtitle.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}{index < settings.heroSubtitle.split("\n").length - 1 && <br />}</span>)}</small><span className="store-preview-cta">เลือกชุดที่ชอบ <b>→</b></span></div></div>{settings.promotionImage && <div className="store-preview-promo"><Image src={settings.promotionImage} alt="ตัวอย่างภาพโปรโมชั่น" fill sizes="(max-width: 1000px) 100vw, 360px" unoptimized /></div>}<div className="store-preview-products"><i /><i /><i /></div></div></div><p>ตัวอย่างอัปเดตตามข้อมูลที่กำลังแก้ไข · กด “บันทึกการตั้งค่า” เพื่อเผยแพร่บนหน้าร้าน</p></aside></div>
  </main>;
}
