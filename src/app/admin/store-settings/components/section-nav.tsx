export const settingsSections = [
  { id: "brand", label: "โลโก้และแบนเนอร์" },
  { id: "how-to", label: "วิธีเช่าและจัดส่ง" },
  { id: "contact", label: "ติดต่อและโซเชียล" },
  { id: "rules", label: "เงื่อนไขการเช่า" },
];

export function SectionNav() {
  return <nav className="store-settings-nav" aria-label="หมวดการตั้งค่า">{settingsSections.map((section, index) => <a key={section.id} href={`#${section.id}`}><span>{index + 1}</span>{section.label}</a>)}</nav>;
}
