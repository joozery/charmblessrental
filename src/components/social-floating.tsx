"use client";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/icon";
import Image from "next/image";
import { useState } from "react";
import { LINE_CONTACT_URL, INSTAGRAM_CONTACT_URL, FACEBOOK_CONTACT_URL } from "@/lib/contact";

const channels = [
  {name:"Instagram",icon:"instagram",href:INSTAGRAM_CONTACT_URL},
  {name:"LINE",icon:"line",href:LINE_CONTACT_URL},
  {name:"Facebook",icon:"facebook",href:FACEBOOK_CONTACT_URL},
];
export default function SocialFloating() {
  const [open,setOpen]=useState(false);
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <aside className={`social-floating ${open ? "is-open" : ""}`} aria-label="ช่องทางติดต่อร้าน"><div className="social-floating-links" id="social-contact-links">{channels.map(channel => channel.href ? <a key={channel.name} href={channel.href} target="_blank" rel="noopener noreferrer" aria-label={`ติดต่อร้านผ่าน ${channel.name}`} title={channel.name}><Image src={`/icons/social/${channel.icon}.svg`} alt="" width={23} height={23} /><span>{channel.name}</span></a> : <button disabled key={channel.name} aria-label={`${channel.name} ยังไม่ได้ตั้งค่าลิงก์ร้าน`} title={`${channel.name}: รอลิงก์ร้าน`}><Image src={`/icons/social/${channel.icon}.svg`} alt="" width={23} height={23} /><span>{channel.name} · รอลิงก์</span></button>)}</div><button className="social-floating-toggle" aria-label={open ? "ปิดช่องทางติดต่อ" : "เปิดช่องทางติดต่อ"} aria-expanded={open} aria-controls="social-contact-links" onClick={() => setOpen(!open)}>{<Icon name={open ? "close" : "chat"} />}</button></aside>;
}
