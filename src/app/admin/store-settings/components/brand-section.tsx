import { SettingsCard, SettingsGroup } from "./settings-card";
import { ImageField } from "./image-field";
import { Textarea } from "@/components/ui/input";
import type { ImageSectionProps } from "./types";

export function BrandSection({ settings, update, uploading, onUpload }: ImageSectionProps) {
  const disabled = uploading !== null;
  return <SettingsCard id="brand" step={1} title="โลโก้และแบนเนอร์" description="โลโก้ ภาพปกหลัก และข้อความบนภาพปก · ใส่ URL รูปเดิม หรือเลือกไฟล์เพื่ออัปโหลดขึ้น Cloudflare R2">
    <SettingsGroup title="โลโก้"><ImageField label="URL โลโก้" imageKey="logoImage" value={settings.logoImage} required disabled={disabled} onChange={logoImage => update({ logoImage })} onUpload={onUpload} /></SettingsGroup>
    <SettingsGroup title="ไอคอนเว็บไซต์"><ImageField label="URL ไอคอนเว็บไซต์ (Favicon)" imageKey="faviconImage" value={settings.faviconImage} required disabled={disabled} onChange={faviconImage => update({ faviconImage })} onUpload={onUpload} /><small>ใช้แสดงบนแท็บ Browser และ Bookmark แนะนำรูปสี่เหลี่ยมจัตุรัส เช่น 512×512 px</small></SettingsGroup>
    <SettingsGroup title="ภาพปกหลัก">
      <ImageField label="URL ภาพปกหลัก" imageKey="heroImage" value={settings.heroImage} required disabled={disabled} onChange={heroImage => update({ heroImage })} onUpload={onUpload} />
      <label>หัวข้อหลักบนภาพปก<Textarea rows={2} value={settings.heroTitle} onChange={e => update({ heroTitle: e.target.value })} /><small>ขึ้นบรรทัดใหม่เพื่อแยกบรรทัด</small></label>
      <label>ข้อความรองบนภาพปก<Textarea rows={2} value={settings.heroSubtitle} onChange={e => update({ heroSubtitle: e.target.value })} /><small>ขึ้นบรรทัดใหม่เพื่อแยกบรรทัด</small></label>
    </SettingsGroup>
    <SettingsGroup title="แบนเนอร์โปรโมชั่น"><ImageField label="URL ภาพโปรโมชั่น (เว้นว่างเพื่อซ่อน)" imageKey="promotionImage" value={settings.promotionImage} disabled={disabled} onChange={promotionImage => update({ promotionImage })} onUpload={onUpload} /></SettingsGroup>
  </SettingsCard>;
}
