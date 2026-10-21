import { SettingsCard, SettingsGroup } from "./settings-card";
import { Input, Textarea } from "@/components/ui/input";
import type { SectionProps } from "./types";

export function HowToSection({ settings, update }: SectionProps) {
  const setStep = (index: number, patch: Partial<{ title: string; description: string }>) => update({ howSteps: settings.howSteps.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <SettingsCard id="how-to" step={2} title="วิธีเช่าและการจัดส่ง" description={<>ขั้นตอนการเช่าที่ลูกค้าเห็น และข้อมูลค่าจัดส่งที่หน้าแสดงสินค้า · ใช้ {"{{emsFee}}"} แทนจำนวนค่าส่ง EMS อัตโนมัติ</>}>
    <SettingsGroup title="ขั้นตอนการเช่า">
      <label>หัวข้อวิธีเช่า<Input value={settings.howTitle} onChange={e => update({ howTitle: e.target.value })} required /></label>
      <div className="store-steps-grid">{settings.howSteps.map((step, index) => <fieldset key={index}><legend>ขั้นตอนที่ {index + 1}</legend><label>หัวข้อ<Input value={step.title} onChange={e => setStep(index, { title: e.target.value })} required /></label><label>คำอธิบาย<Input value={step.description} onChange={e => setStep(index, { description: e.target.value })} required /></label></fieldset>)}</div>
    </SettingsGroup>
    <SettingsGroup title="การจัดส่ง">
      <label>ข้อความช่องทางจัดส่ง<Textarea rows={2} value={settings.shippingText} onChange={e => update({ shippingText: e.target.value })} /></label>
      <p className="text-xs leading-6 text-slate-500">ราคาขนส่งแต่ละแบบ โปรส่งฟรี และค่าส่งแมส ตั้งได้ที่เมนู <a className="font-semibold text-[#79516c] underline" href="/admin/delivery-settings">ค่าจัดส่ง</a> · ใส่ {"{{emsFee}}"} ในข้อความเพื่อแสดงราคา EMS ปัจจุบัน</p>
    </SettingsGroup>
  </SettingsCard>;
}
