"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-provider";
import BookingForm from "./booking-form";
import { products } from "@/lib/products";

function NavIcon({kind}: {kind: "home" | "catalog" | "cart" | "help"}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "home" ? <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></> : kind === "catalog" ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : kind === "cart" ? <><path d="M5 7h14l1 14H4Z" /><path d="M9 8V5a3 3 0 0 1 6 0v3" /></> : <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01" /></>}</svg>;
}
export default function MobileNavigation() {
  const pathname=usePathname();
  const {cart,setCart}=useCart();
  return <nav className="mobile-app-navigation" aria-label="เมนูหลักมือถือ"><Link href="/" aria-current={pathname === "/" ? "page" : undefined}><NavIcon kind="home" /><span>หน้าแรก</span></Link><Link href="/#recommended" aria-current={pathname.startsWith("/products/") ? "page" : undefined}><NavIcon kind="catalog" /><span>เลือกชุด</span></Link><BookingForm items={cart.map(item => ({id:item.id,name:products.find(p => p.id===item.id)!.thai,dailyRate:products.find(p => p.id===item.id)!.dailyRate,image:products.find(p => p.id===item.id)!.images[0]}))} onRemove={id => setCart(items => items.filter(item => item.id!==id))} trigger={<button><span className="mobile-cart-icon"><NavIcon kind="cart" />{cart.length > 0 && <b>{cart.length}</b>}</span><span>ตะกร้า</span></button>} /><Link href="/#how-to-rent"><NavIcon kind="help" /><span>วิธีเช่า</span></Link></nav>;
}
