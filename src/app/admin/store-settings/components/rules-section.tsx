import { SettingsCard, SettingsGroup } from "./settings-card";
import { Textarea } from "@/components/ui/input";
import type { SectionProps } from "./types";

export function RulesSection({ settings, update }: SectionProps) {
  return <SettingsCard id="rules" step={4} title="เงื่อนไขการเช่า" description="แยกแต่ละข้อด้วยการขึ้นบรรทัดใหม่ · แสดงบนหน้าร้านและใบรายละเอียดการเช่า">
    <SettingsGroup title="รายการเงื่อนไข"><label>เงื่อนไขการเช่า<Textarea rows={12} value={settings.rentalRules.join("\n")} onChange={e => update({ rentalRules: e.target.value.split("\n").filter(rule => rule.trim()) })} /></label></SettingsGroup>
  </SettingsCard>;
}
