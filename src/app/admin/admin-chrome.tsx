"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DropdownMenu } from "radix-ui";
import type { Permission } from "@/lib/permissions";

export default function AdminChrome({ user, counts, children }: {
  user: { name: string; email?: string; username: string; role: "owner" | "admin"; permissions: Permission[] };
  counts: { products: number; admins: number; bookings: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const commandInput = useRef<HTMLInputElement>(null);
  const role = user.role === "owner" ? "เจ้าของร้าน" : "แอดมิน";
  const initials = Array.from(user.name || user.username).slice(0, 2).join("").toUpperCase();
  const allowed = (permission?: Permission) => !permission || user.permissions.includes(permission);
  const navigation = [
    { href: "/admin", title: "ภาพรวม", description: "แดชบอร์ดร้าน", icon: "home" as const, count: null as number | null },
    { href: "/admin/rentals", title: "ประวัติการเช่า", description: "ค้นหารายการเช่าและข้อมูลลูกค้า", icon: "calendar" as const, count: null as number | null, permission: "rentals" as Permission },
    { href: "/admin/bookings", title: "คำขอจอง", description: "ตรวจสอบและอัปเดตคำขอจากลูกค้า", icon: "booking" as const, count: counts.bookings, permission: "bookings" as Permission },
    { href: "/admin/preparation", title: "เตรียมสินค้า", description: "ตรวจสภาพ ซัก ซ่อม และยืนยันพร้อมให้เช่า", icon: "box" as const, count: null as number | null, permission: "shipping" as Permission },
    { href: "/admin/identity", title: "ยืนยันตัวตน", description: "ลูกค้าที่ไม่วางเงินมัดจำ", icon: "users" as const, count: null as number | null, permission: "identity" as Permission },
    { href: "/admin/finance", title: "สรุปการเงิน", description: "ยอดเช่า ยอดชำระ และเงินมัดจำ", icon: "payment" as const, count: null as number | null, permission: "finance" as Permission },
    { href: "/admin/store-settings", title: "ตั้งค่าหน้าร้าน", description: "ข้อความและช่องทางติดต่อหน้าร้าน", icon: "sliders" as const, count: null as number | null, permission: "settings" as Permission },
    { href: "/admin/rental-document-settings", title: "ตั้งค่าใบรายละเอียดการเช่า", description: "บัญชีชำระเงินและข้อมูลส่งคืน", icon: "payment" as const, count: null as number | null, permission: "settings" as Permission },
    { href: "/admin/products", title: "จัดการสินค้า", description: "คอลเลกชันและสินค้าให้เช่า", icon: "grid" as const, count: counts.products, permission: "products" as Permission },
    { href: "/admin/rental-pricing", title: "ราคาเช่า", description: "ราคาตามจำนวนวัน 1 / 3 / 5 / 7 วัน", icon: "payment" as const, count: null as number | null, permission: "products" as Permission },
    { href: "/admin/delivery-settings", title: "ค่าจัดส่ง", description: "ค่าส่งแมสตามระยะทางจากร้าน", icon: "delivery" as const, count: null as number | null, permission: "settings" as Permission },
    { href: "/admin/availability", title: "จัดการคิวว่าง", description: "จำนวนชุดว่างรายวัน", icon: "calendar" as const, count: null as number | null, permission: "products" as Permission },
    { href: "/admin/activity", title: "ประวัติการทำรายการ", description: "ใครทำอะไร เมื่อใด และการเข้าสู่ระบบ", icon: "history" as const, count: null as number | null, permission: "activity" as Permission },
    ...(user.role === "owner" ? [{ href: "/admin/admins", title: "จัดการแอดมิน", description: "ทีมงานและสิทธิ์ใช้งาน", icon: "users" as const, count: counts.admins }] : []),
  ].filter(item => allowed(item.permission));
  const navigationGroups = [
    { label: "ภาพรวม", items: navigation.filter(item => ["/admin", "/admin/rentals", "/admin/bookings", "/admin/identity", "/admin/preparation"].includes(item.href)) },
    { label: "จัดการร้าน", items: navigation.filter(item => ["/admin/finance", "/admin/store-settings", "/admin/products", "/admin/rental-pricing", "/admin/delivery-settings", "/admin/availability"].includes(item.href)) },
    { label: "เอกสารการเช่า", items: navigation.filter(item => item.href === "/admin/rental-document-settings") },
    { label: "ทีมงาน", items: navigation.filter(item => ["/admin/admins", "/admin/activity"].includes(item.href)) },
  ].filter(group => group.items.length);
  const current = navigation.find(item => item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)) || navigation[0];
  const commands = [...navigation, { href: "/", title: "เปิดหน้าร้าน", description: "ชมหน้าร้าน Charm Bless Rental", icon: "store" as const, count: 0 }].filter(item => `${item.title} ${item.description}`.includes(query.trim()));
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "k" || event.code === "KeyK")) {
        event.preventDefault(); setQuery(""); setSelected(0); setCommandOpen(open => !open);
      }
    }
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, []);
  async function logout() {
    setLoggingOut(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      router.replace("/admin/login"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ"); setLoggingOut(false); }
  }
  function go(href: string) { setMobileOpen(false); setCommandOpen(false); router.push(href); }
  function sidebar(mobile = false) {
    return <>
      <div className="chrome-brand-row"><Link href="/admin" className="chrome-brand" aria-label="Charm Bless หลังบ้าน" onClick={() => setMobileOpen(false)}><span className="chrome-brand-symbol"><Icon name="spark" /></span><span className="chrome-brand-copy">charm bless<span>RENTAL MANAGEMENT</span></span></Link>{mobile && <Dialog.Close className="chrome-mobile-close" aria-label="ปิดเมนู"><Icon className="chrome-icon" name="close" /></Dialog.Close>}</div>
      <nav className="chrome-navigation" aria-label={mobile ? "เมนูหลังบ้านมือถือ" : "เมนูหลังบ้าน"}>{navigationGroups.map(group => <div className="chrome-nav-group" key={group.label}><span className="chrome-group-label">{group.label}</span>{group.items.map(item => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={active ? "chrome-nav-link is-active" : "chrome-nav-link"} aria-label={item.title} aria-current={active ? "page" : undefined} title={collapsed && !mobile ? item.title : undefined}><span className="chrome-nav-icon"><Icon className="chrome-icon" name={item.icon} /></span><span className="chrome-nav-copy"><strong>{item.title}</strong></span>{item.count !== null && <span className="chrome-nav-count">{item.count.toLocaleString("th-TH")}</span>}{active && <span className="chrome-active-dot" />}</Link>;
      })}</div>)}</nav>
      <div className="chrome-sidebar-spacer" />
      <div className="chrome-sidebar-footer"><Link href="/" target="_blank" rel="noopener noreferrer" title={collapsed && !mobile ? "เปิดหน้าร้าน" : undefined}><Icon className="chrome-icon" name="store" /><span className="chrome-store-copy"><strong>เปิดหน้าร้าน</strong><small>ดูเว็บไซต์สำหรับลูกค้า</small></span><Icon className="chrome-icon" name="arrow" /></Link></div>

    </>;
  }
  if (pathname === "/admin/login") return children;
  return <div className="admin-shell chrome-shell" data-collapsed={collapsed}>
    <aside className="chrome-sidebar">{sidebar()}</aside>
    <div className="admin-workspace chrome-workspace">
      <header className="chrome-topbar">
        <div className="chrome-header-left"><Button variant="ghost" className="chrome-icon-button chrome-collapse-button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"} aria-expanded={!collapsed} title={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}><Icon className="chrome-icon" name="collapse" /></Button><Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Trigger className="chrome-icon-button chrome-mobile-trigger" aria-label="เปิดเมนูหลังบ้าน"><Icon className="chrome-icon" name="menu" /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="chrome-mobile-overlay" /><Dialog.Content className="chrome-mobile-sidebar"><Dialog.Title className="admin-sr-only">เมนูจัดการร้าน</Dialog.Title><Dialog.Description className="admin-sr-only">เลือกหน้าจัดการสินค้าหรือบัญชีแอดมิน</Dialog.Description>{sidebar(true)}</Dialog.Content></Dialog.Portal></Dialog.Root><span className="chrome-header-divider" /><div className="chrome-breadcrumb-block"><span className="chrome-breadcrumb-label">CHARM BLESS · หลังบ้าน</span><nav className="chrome-breadcrumb" aria-label="ตำแหน่งหน้าปัจจุบัน"><Link href="/admin" aria-label="หน้าหลักหลังบ้าน"><Icon className="chrome-icon" name="home" /></Link><Icon className="chrome-icon" name="chevron" /><span>จัดการร้าน</span><Icon className="chrome-icon" name="chevron" /><strong>{current.title}</strong></nav></div></div>
        <div className="chrome-header-actions"><Button variant="ghost" className="chrome-command-trigger" onClick={() => { setQuery(""); setSelected(0); setCommandOpen(true); }} aria-label="ค้นหาเมนู"><Icon className="chrome-icon" name="search" /><span>ค้นหาเมนู</span><kbd>⌘ K</kbd></Button><span className="chrome-header-divider" /><span className="chrome-system-status"><i />โหมดผู้ดูแล</span><DropdownMenu.Root><DropdownMenu.Trigger className="chrome-account-trigger" disabled={loggingOut} aria-label="เมนูบัญชีแอดมิน"><span className="chrome-avatar">{initials}</span><span className="chrome-account-copy"><strong>{user.name}</strong><small>{role}</small></span><Icon className="chrome-icon" name="chevron" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="chrome-account-menu" align="end" sideOffset={12}><DropdownMenu.Label className="chrome-menu-label"><strong>{user.name}</strong><span>{user.email || user.username} · {role}</span></DropdownMenu.Label><DropdownMenu.Separator className="chrome-menu-separator" />{user.role === "owner" && <DropdownMenu.Item className="chrome-menu-item" asChild><Link href="/admin/admins"><Icon className="chrome-icon" name="users" />จัดการบัญชีแอดมิน<Icon className="chrome-icon" name="chevron" /></Link></DropdownMenu.Item>}<DropdownMenu.Item className="chrome-menu-item" asChild><Link href="/" target="_blank" rel="noopener noreferrer"><Icon className="chrome-icon" name="store" />เปิดหน้าร้าน<Icon className="chrome-icon" name="arrow" /></Link></DropdownMenu.Item><DropdownMenu.Separator className="chrome-menu-separator" /><DropdownMenu.Item className="chrome-menu-item chrome-menu-danger" disabled={loggingOut} onSelect={() => void logout()}><Icon className="chrome-icon" name="logout" />{loggingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
      </header>
      {error && <p className="admin-error chrome-session-error" role="alert">{error}</p>}
      <div className="chrome-page-content" key={pathname}>{children}</div>
    </div>
    <Dialog.Root open={commandOpen} onOpenChange={setCommandOpen}><Dialog.Portal><Dialog.Overlay className="chrome-command-overlay" /><Dialog.Content className="chrome-command-dialog" onOpenAutoFocus={event => { event.preventDefault(); commandInput.current?.focus(); }}><Dialog.Title className="admin-sr-only">ค้นหาเมนูหลังบ้าน</Dialog.Title><Dialog.Description className="admin-sr-only">พิมพ์ชื่อหน้า ใช้ลูกศรขึ้นลงและ Enter เพื่อเปิดหน้า</Dialog.Description><div className="chrome-command-input"><Icon className="chrome-icon" name="search" /><input ref={commandInput} aria-label="พิมพ์ชื่อเมนู" placeholder="อยากไปหน้าไหน?" value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setSelected(n => Math.min(n + 1, commands.length - 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setSelected(n => Math.max(n - 1, 0)); }
        if (event.key === "Enter" && commands[selected]) { event.preventDefault(); go(commands[selected].href); }
      }} /><Dialog.Close aria-label="ปิดการค้นหา"><kbd>esc</kbd></Dialog.Close></div><div className="chrome-command-results"><p>ทางลัดสำหรับร้านของคุณ</p>{commands.map((item, index) => <Button variant="ghost" key={item.href} className={index === selected ? "chrome-command-result is-selected" : "chrome-command-result"} onMouseEnter={() => setSelected(index)} onClick={() => go(item.href)}><span><Icon className="chrome-icon" name={item.icon} /></span><div><strong>{item.title}</strong></div><Icon className="chrome-icon" name="chevron" /></Button>)}{!commands.length && <div className="chrome-command-empty">ไม่พบเมนูที่ค้นหา ลองใช้คำว่า “สินค้า” หรือ “แอดมิน”</div>}</div><div className="chrome-command-foot"><span>↑ ↓ เลือกเมนู <span>↵ เปิดหน้า</span></span><span>CHARM BLESS</span></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
