import { SettingsCard, SettingsGroup } from "./settings-card";
import { Input } from "@/components/ui/input";
import type { SectionProps } from "./types";

export function ContactSection({ settings, update }: SectionProps) {
  return <SettingsCard id="contact" step={3} title="ติดต่อร้านและโซเชียล" description="ข้อความส่วนติดต่อ ท้ายเว็บไซต์ และลิงก์ที่ใช้กับปุ่มติดต่อและไอคอนลอยบนหน้าร้าน">
    <SettingsGroup title="ข้อความส่วนติดต่อ">
      <label>หัวข้อส่วนติดต่อ<Input value={settings.contactTitle} onChange={e => update({ contactTitle: e.target.value })} /></label>
      <label>คำอธิบายส่วนติดต่อ<Input value={settings.contactDescription} onChange={e => update({ contactDescription: e.target.value })} /></label>
      <label>ข้อความท้ายเว็บไซต์<Input value={settings.footerTagline} onChange={e => update({ footerTagline: e.target.value })} /></label>
    </SettingsGroup>
    <SettingsGroup title="ช่องทางโซเชียล">
      <label>LINE URL<Input type="url" value={settings.lineUrl} onChange={e => update({ lineUrl: e.target.value })} /></label>
      <label>Instagram URL<Input type="url" value={settings.instagramUrl} onChange={e => update({ instagramUrl: e.target.value })} /></label>
      <label>Facebook URL<Input type="url" value={settings.facebookUrl} onChange={e => update({ facebookUrl: e.target.value })} /></label>
    </SettingsGroup>
  </SettingsCard>;
}
