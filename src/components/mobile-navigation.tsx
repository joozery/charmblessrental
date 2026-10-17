"use client";
import { Icon } from "./ui/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-provider";
import BookingForm from "./booking-form";
import { useProducts } from "@/components/products-provider";

function NavIcon({kind}: {kind: "home" | "catalog" | "cart" | "help"}) {
  return <Icon name={kind === "catalog" ? "grid" : kind === "cart" ? "bag" : kind} />;
}
export default function MobileNavigation() {
  const products = useProducts();
  const pathname=usePathname();
  const {cart,setCart}=useCart();
  if (pathname.startsWith("/admin")) return null;
  return <nav className="mobile-app-navigation" aria-label="เมนูหลักมือถือ"><Link href="/" aria-current={pathname === "/" ? "page" : undefined}><NavIcon kind="home" /><span>หน้าแรก</span></Link><Link href="/#recommended" aria-current={pathname.startsWith("/products/") ? "page" : undefined}><NavIcon kind="catalog" /><span>เลือกชุด</span></Link><BookingForm items={cart.filter(item => products.some(p => p.id === item.id)).map(item => ({id:item.id,name:products.find(p => p.id===item.id)!.thai,dailyRate:products.find(p => p.id===item.id)!.dailyRate,image:products.find(p => p.id===item.id)!.images[0]}))} onRemove={id => setCart(items => items.filter(item => item.id!==id))} trigger={<button><span className="mobile-cart-icon"><NavIcon kind="cart" />{cart.length > 0 && <b>{cart.length}</b>}</span><span>ตะกร้า</span></button>} /><Link href="/#how-to-rent"><NavIcon kind="help" /><span>วิธีเช่า</span></Link></nav>;
}
