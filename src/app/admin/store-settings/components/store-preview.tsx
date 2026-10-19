import Image from "next/image";
import type { StoreSettings } from "@/lib/store-settings";

function Lines({ text }: { text: string }) {
  const lines = text.split("\n");
  return <>{lines.map((line, index) => <span key={`${line}-${index}`}>{line}{index < lines.length - 1 && <br />}</span>)}</>;
}

export function StorePreview({ settings }: { settings: StoreSettings }) {
  return <aside className="store-settings-preview" aria-label="ตัวอย่างหน้าร้าน"><div className="store-preview-heading"><div><span>LIVE PREVIEW</span><h2>ตัวอย่างหน้าร้าน</h2></div><span className="store-preview-badge"><i />ตัวอย่าง</span></div><div className="store-preview-browser"><div className="store-preview-toolbar"><i /><i /><i /><span>charmblessrental.com</span></div><div className="store-preview-site"><div className="store-preview-brand">{settings.logoImage && <Image src={settings.logoImage} alt="" width={30} height={30} unoptimized />}<strong>CHARM BLESS <small>RENTAL</small></strong></div><div className="store-preview-hero">{settings.heroImage && <Image src={settings.heroImage} alt="ตัวอย่างภาพปกหน้าร้าน" fill sizes="(max-width: 1000px) 100vw, 360px" unoptimized />}<div className="store-preview-hero-copy"><strong><Lines text={settings.heroTitle} /></strong><small><Lines text={settings.heroSubtitle} /></small><span className="store-preview-cta">เลือกชุดที่ชอบ <b>→</b></span></div></div>{settings.promotionImage && <div className="store-preview-promo"><Image src={settings.promotionImage} alt="ตัวอย่างภาพโปรโมชั่น" fill sizes="(max-width: 1000px) 100vw, 360px" unoptimized /></div>}<div className="store-preview-products"><i /><i /><i /></div></div></div><p>ตัวอย่างอัปเดตตามข้อมูลที่กำลังแก้ไข · กด “บันทึกการตั้งค่า” เพื่อเผยแพร่บนหน้าร้าน</p></aside>;
}
