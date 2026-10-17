"use client";

import { Icon as UiIcon, type IconName } from "@/components/ui/icon";
import Image from "next/image";
import Link from "next/link";
import { LINE_CONTACT_URL } from "@/lib/contact";
import { useProducts } from "@/components/products-provider";
import { categoryLabels, type Product } from "@/lib/products";
import { useCart } from "@/components/cart-provider";
import BookingForm from "@/components/booking-form";
import { useState } from "react";
import { Dialog, Tabs } from "radix-ui";

function Logo({ size = 48 }: { size?: number }) {
  return <Image src="/exam/logo.jpg" alt="Charm Bless Rental" width={size} height={size} style={{ width: size, height: size, objectFit: "contain", borderRadius: "50%", flexShrink: 0 }} />;
}

function FashionPhoto({ image, label, className = "", hero = false }: { image: string; label: string; className?: string; hero?: boolean }) {
  return <div className={`fashion-photo ${className}`}><Image src={(image.startsWith("/") || image.startsWith("https://")) ? image : `/images/${image}.png`} alt={label} width={image === "editorial-hero" ? 1536 : 1024} height={image === "editorial-hero" ? 1024 : 1536} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} sizes={hero ? "100vw" : "(max-width: 600px) 50vw, (max-width: 900px) 33vw, (max-width: 1100px) 25vw, (min-width: 1400px) 17vw, 20vw"} loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : "auto"} /></div>;
}

function Icon({ name, className = "", ...props }: { name: string; className?: string } & Omit<React.SVGProps<SVGSVGElement>, "children">) {
  const aliases: Record<string, IconName> = { arrow: "arrowRight", chevron: "chevronDown" };
  return <UiIcon name={aliases[name] || name as IconName} className={`size-5 ${className}`} {...props} />;
}

function ContactButton({ outline = false, children = "สอบถามร้าน" }: { outline?: boolean; children?: React.ReactNode }) {
  return <a href={LINE_CONTACT_URL} target="_blank" rel="noopener noreferrer" className={`pill ${outline ? "pill-outline" : "pill-pink"}`}><Icon name="chat" />{children}</a>;
}

export default function Home() {
  const products = useProducts();
  const [limit, setLimit] = useState(48);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sort, setSort] = useState("popular");
  const [color, setColor] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { cart, setCart } = useCart();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const visible = products.filter(p => (filter === "all" || p.category === filter) && (color === "all" || p.color === color) && `${p.name} ${p.thai} ${p.tag} ${p.color} ${p.sku || ""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => sort === "name" ? a.thai.localeCompare(b.thai,"th") : sort === "new" ? b.id-a.id : a.id-b.id);
  function productCard(p: Product, featured = false) { return (
    <article className="shop-card" key={p.id}>
      <div className="shop-card-image"><Link href={`/products/${p.image}`} aria-label={`ดู ${p.thai}`}><FashionPhoto image={p.images[0]} label={p.thai} /></Link>{featured && <span className="shop-badge">แนะนำ</span>}</div>
      <div className="shop-card-info"><h3><Link href={`/products/${p.image}`}>{p.thai}</Link></h3><p className="shop-price"><strong>{p.dailyRate === null ? "สอบถามราคา" : `฿${p.dailyRate.toLocaleString("th-TH")}`}</strong>{p.dailyRate !== null && <span> / วัน</span>}</p>
      <Link href={`/products/${p.image}`} className="product-details">ดูรายละเอียด <UiIcon name="arrowRight" /></Link></div>
    </article>
  ); }
  return (<>
      <header className="site-header"><div className="container shop-header"><a href="#" className="shop-brand"><Logo /><span>CHARM BLESS Rental</span></a><nav className="desktop-nav" aria-label="เมนูหลัก"><a href="#recommended" className="nav-link nav-active">ชุดให้เช่า</a><a href="#how-to-rent" className="nav-link">วิธีเช่า</a><a href={LINE_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="nav-link">ติดต่อร้าน</a></nav><div className="shop-header-actions"><BookingForm items={cart.filter(item => products.some(p => p.id === item.id)).map(item => ({id:item.id,name:products.find(p => p.id === item.id)!.thai,dailyRate:products.find(p => p.id === item.id)!.dailyRate,image:products.find(p => p.id === item.id)!.images[0]}))} initialStart={startDate} initialEnd={endDate} onRemove={id => setCart(items => items.filter(item => item.id !== id))} trigger={<button className="pill pill-outline cart-trigger"><Icon name="bag" />ตะกร้า{cart.length > 0 && <span>{cart.length}</span>}</button>} /><Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}><Dialog.Trigger className="search-button mobile-menu-trigger" aria-label="เปิดเมนู"><Icon name="menu" /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="mobile-menu-panel"><Dialog.Title className="text-lg font-semibold">CHARM BLESS Rental</Dialog.Title><Dialog.Description className="mt-2 text-sm text-slate-500">เลือกชุดที่ชอบสำหรับวันของคุณ</Dialog.Description><nav className="mobile-nav" aria-label="เมนูมือถือ">{[["ชุดให้เช่า","recommended"],["วิธีเช่า","how-to-rent"],["ติดต่อร้าน","contact"]].map(([name,id]) => <Dialog.Close key={id} asChild><a href={id === "contact" ? LINE_CONTACT_URL : `#${id}`} target={id === "contact" ? "_blank" : undefined} rel={id === "contact" ? "noopener noreferrer" : undefined}>{name}</a></Dialog.Close>)}</nav><Dialog.Close className="dialog-close" aria-label="ปิดเมนู"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></div></div></header>
      <main>
        <section className="rental-banner cover-banner"><Image src="/herocover/cover.png" alt="Charm Bless Rental ชุดออกงานและเสื้อกันหนาว" width={2048} height={683} loading="eager" fetchPriority="high" sizes="100vw" style={{width:"100%",height:"auto",display:"block"}} /><div className="container cover-copy"><h1>ลุคที่ใช่<br /><span>พร้อมให้คุณเช่า</span></h1><p>ชุดออกงาน เสื้อกันหนาว รองเท้า และอีกมากมาย<br />ให้ทุกโอกาสพิเศษของคุณ…ง่ายขึ้น</p></div></section>
        <section id="recommended" className="container rental-shop"><button className="mobile-filter-toggle" aria-expanded={filtersOpen} aria-controls="catalog-extra-filters" onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="sliders" />ตัวกรอง{color !== "all" && <span>1</span>}<Icon name="chevron" /></button><div className={`shop-search ${filtersOpen ? "filters-expanded" : ""}`}><label className="shop-search-input"><Icon name="search" /><input aria-label="ค้นหาชุด" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชุด สี หรือสไตล์" /></label><div className="shop-dates"><Icon name="calendar" /><label>วันรับชุด<input type="date" aria-label="วันรับชุด" value={startDate} onChange={e => {setStartDate(e.target.value);if(endDate && endDate < e.target.value)setEndDate("");}} /></label><span>–</span><label>วันคืนชุด<input type="date" aria-label="วันคืนชุด" min={startDate || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} /></label></div><select className="shop-select" aria-label="เรียงสินค้า" value={sort} onChange={e => setSort(e.target.value)}><option value="popular">แนะนำ</option><option value="new">ใหม่ล่าสุด</option><option value="name">เรียงตามชื่อ</option></select></div>
          <div id="catalog-extra-filters" className={`catalog-filter-row ${filtersOpen ? "filters-expanded" : ""}`}><label>สี<select className="shop-select" value={color} onChange={e => setColor(e.target.value)}><option value="all">ทุกสี</option>{Array.from(new Set(products.map(p => p.color).filter(Boolean))).map(c => <option key={c} value={c}>{c}</option>)}</select></label><label>ราคาเช่า<select className="shop-select" disabled aria-describedby="filter-data-note"><option>รอข้อมูลราคาจากร้าน</option></select></label><label>วันว่าง<select className="shop-select" disabled aria-describedby="filter-data-note"><option>รอร้านยืนยันคิว</option></select></label><button className="clear-filters" onClick={() => {setQuery("");setFilter("all");setColor("all");setStartDate("");setEndDate("");setSort("popular");}}>ล้างตัวกรอง</button></div><div className="filter-summary"><span>พบ {visible.length} รายการ{startDate && endDate && endDate > startDate ? ` · ระยะเวลาเช่า ${Math.round((Date.parse(endDate)-Date.parse(startDate))/86400000)} วัน` : ""}</span><span id="filter-data-note">ราคาและวันว่างยังไม่เชื่อมข้อมูลร้าน จึงยังกรองสองส่วนนี้ไม่ได้</span></div>
          {(startDate || endDate) && <p className="date-note">วันที่เลือกใช้เพื่อแจ้งร้าน กรุณาสอบถามความพร้อมของชุดก่อนยืนยันการเช่า</p>}
          <Tabs.Root value={filter} onValueChange={setFilter}><Tabs.List className="filter-tabs shop-tabs" aria-label="หมวดสินค้า">{[["all","ทั้งหมด"], ...Array.from(new Set(products.map(p => p.category))).map(c => [c, categoryLabels[c] || c])].map(([value,label]) => <Tabs.Trigger value={value} key={value}>{label}</Tabs.Trigger>)}</Tabs.List><Tabs.Content value={filter}>
          {visible.length > 0 ? <><div className="section-heading shop-section-heading"><h2>กำลังฮิต</h2><a href="#all-products" className="text-link">ดูทั้งหมด <Icon name="arrow" /></a></div><div className="trending-grid">{visible.slice(0,4).map(p => productCard(p,true))}</div><div id="all-products" className="section-heading shop-section-heading all-products-heading"><h2>ชุดให้เช่าทั้งหมด <span>{visible.length} รายการ</span></h2></div><div className="product-grid">{visible.slice(0,limit).map(p => productCard(p))}</div>{visible.length > limit && <div style={{textAlign:"center",marginTop:24}}><button className="pill pill-outline" onClick={() => setLimit(n => n + 48)}>ดูสินค้าเพิ่มเติม ({visible.length - limit} รายการ)</button></div>}</> : <div className="empty-state"><p>ไม่พบรายการที่ตรงกับตัวเลือก</p><button className="pill pill-pink" onClick={() => {setQuery("");setFilter("all");setColor("all");}}>ดูชุดทั้งหมด</button></div>}
          </Tabs.Content></Tabs.Root>
        </section>
        <section className="container promotion-section" aria-label="โปรโมชั่น Charm Bless Rental">
          <div className="promotion-image-banner" style={{ width: "100%", aspectRatio: "1983 / 793", backgroundImage: "url(/herocover/promotion.png)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", borderRadius: 12 }} role="img" aria-label="ภาพโปรโมชั่นร้าน Charm Bless Rental" />
        </section>
        <section id="how-to-rent" className="shop-how"><div className="container"><h2><span>วิธีเช่า</span> ง่ายๆ เพียง 3 ขั้นตอน</h2><div className="steps">{[["เลือกชุดและวันใช้งาน","ค้นหาชุดที่ชอบ เลือกวันที่ต้องการ","calendar"],["เพิ่มลงตะกร้า","รวบรวมรายการที่สนใจ","bag"],["สอบถามและยืนยันกับร้าน","เช็กวันว่าง ราคา และเงื่อนไขกับร้าน","chat"]].map(([title,description,icon],i) => <div className="step" key={title}><span className="step-number">{i+1}</span><Icon name={icon} /><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></div></section>
        <section id="contact" className="shop-contact container"><div><h2>ให้เราช่วยเลือกลุคของคุณ</h2><p>สอบถามชุดจริง ราคา และวันที่ต้องการใช้งาน</p></div><ContactButton>ติดต่อร้าน</ContactButton></section>
      </main>
      <footer><div className="container footer-inner"><a href="#" className="flex items-center gap-3"><Logo /><span className="brand-name">CHARM BLESS<span>RENTAL WARDROBE</span></span></a><p>เลือกเช่า เลือกเป็นตัวคุณ ในทุกวันพิเศษ</p><nav aria-label="เมนูท้ายหน้า"><a href="#recommended">คอลเลกชัน</a><a href="#how-to-rent">วิธีเช่า</a><a href={LINE_CONTACT_URL} target="_blank" rel="noopener noreferrer">ติดต่อเรา</a></nav></div><div className="container footer-bottom">© {2026} CHARM BLESS RENTAL<span>Curated with care.</span></div></footer>
    </>
  );
}
