"use client";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/icon";
import Image from "next/image";
import { useState } from "react";
import { useStoreSettings } from "@/components/store-settings-provider";
export default function SocialFloating() {
  const [open,setOpen]=useState(false);
  const pathname = usePathname();
  const settings = useStoreSettings();
  const channels = [
    {name:"Instagram",icon:"instagram",href:settings.instagramUrl},
    {name:"LINE",icon:"line",href:settings.lineUrl},
    {name:"Facebook",icon:"facebook",href:settings.facebookUrl},
  ];
  if (pathname.startsWith("/admin")) return null;
  return <aside className={open ? "social-floating is-open" : "social-floating"} aria-label="ช่องทางติดต่อร้าน"><div className="social-floating-links" id="social-contact-links">{channels.map(channel => channel.href ? <a key={channel.name} href={channel.href} target="_blank" rel="noopener noreferrer" aria-label={`ติดต่อร้านผ่าน ${channel.name}`} title={channel.name}><Image src={`/icons/social/${channel.icon}.svg`} alt="" width={23} height={23} /><span>{channel.name}</span></a> : <button disabled key={channel.name} aria-label={`${channel.name} ยังไม่ได้ตั้งค่าลิงก์ร้าน`} title={`${channel.name}: รอลิงก์ร้าน`}><Image src={`/icons/social/${channel.icon}.svg`} alt="" width={23} height={23} /><span>{channel.name} · รอลิงก์</span></button>)}</div><button className="social-floating-toggle" aria-label={open ? "ปิดช่องทางติดต่อ" : "เปิดช่องทางติดต่อ"} aria-expanded={open} aria-controls="social-contact-links" onClick={() => setOpen(!open)}>{<Icon name={open ? "close" : "chat"} />}</button></aside>;
}
