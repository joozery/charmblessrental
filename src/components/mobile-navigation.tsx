"use client";
import { Icon } from "./ui/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const cartItems = cart.filter(item => products.some(product => product.id === item.id)).map(item => { const product = products.find(row => row.id === item.id)!; const variant = product.variants?.find(option => option.id === item.variantId); const images = variant?.images?.length ? variant.images : product.images; return { id: item.id, variantId: item.variantId, color: variant?.color, size: variant?.size, name: product.thai, pricing: product.pricing, shippingFee: product.shippingFee, category: product.category, image: images[0] }; });
  const [section, setSection] = useState("");
  useEffect(() => {
    if (pathname !== "/") return;
    const update = () => {
      const line = window.innerHeight * 0.4;
      const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
      setSection(top("how-to-rent") <= line ? "how-to-rent" : top("recommended") <= 120 ? "recommended" : "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);
  if (pathname.startsWith("/admin")) return null;
  const onHome = pathname === "/";
  return <nav className="mobile-app-navigation" aria-label="เมนูหลักมือถือ"><Link href="/" aria-current={onHome && !section ? "page" : undefined} onClick={event => { if (!onHome) return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><NavIcon kind="home" /><span>หน้าแรก</span></Link><Link href="/#recommended" aria-current={pathname.startsWith("/products/") || (onHome && section === "recommended") ? "page" : undefined}><NavIcon kind="catalog" /><span>เลือกชุด</span></Link><BookingForm items={cartItems} onRemove={(id, variantId) => setCart(items => items.filter(item => !(item.id === id && item.variantId === variantId)))} trigger={<button><span className="mobile-cart-icon"><NavIcon kind="cart" />{cart.length > 0 && <b>{cart.length}</b>}</span><span>ตะกร้า</span></button>} /><Link href="/#how-to-rent" aria-current={onHome && section === "how-to-rent" ? "page" : undefined}><NavIcon kind="help" /><span>วิธีเช่า</span></Link></nav>;
}
