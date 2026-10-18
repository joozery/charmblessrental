"use client";

import { Icon as UiIcon, type IconName } from "@/components/ui/icon";
import Image from "next/image";
import Link from "next/link";
import { useProducts } from "@/components/products-provider";
import { categoryLabels, type Product } from "@/lib/products";
import { useCart } from "@/components/cart-provider";
import BookingForm from "@/components/booking-form";
import { useEffect, useState } from "react";
import { Dialog, Tabs } from "radix-ui";
import { useStoreSettings } from "@/components/store-settings-provider";

function Logo({ size = 48 }: { size?: number }) {
  const settings = useStoreSettings();
  return <Image src={settings.logoImage} alt="Charm Bless Rental" width={size} height={size} unoptimized={settings.logoImage.startsWith("https://")} style={{ width: size, height: size, objectFit: "contain", borderRadius: "50%", flexShrink: 0 }} />;
}

function FashionPhoto({ image, label, className = "", hero = false }: { image: string; label: string; className?: string; hero?: boolean }) {
  return <div className={`fashion-photo ${className}`}><Image src={(image.startsWith("/") || image.startsWith("https://")) ? image : `/images/${image}.png`} alt={label} width={image === "editorial-hero" ? 1536 : 1024} height={image === "editorial-hero" ? 1024 : 1536} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} sizes={hero ? "100vw" : "(max-width: 600px) 50vw, (max-width: 900px) 33vw, (max-width: 1100px) 25vw, (min-width: 1400px) 17vw, 20vw"} loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : "auto"} /></div>;
}

function Icon({ name, className = "", ...props }: { name: string; className?: string } & Omit<React.SVGProps<SVGSVGElement>, "children">) {
  const aliases: Record<string, IconName> = { arrow: "arrowRight", chevron: "chevronDown" };
  return <UiIcon name={aliases[name] || name as IconName} className={`size-5 ${className}`} {...props} />;
}

function ContactButton({ outline = false, children = "สอบถามร้าน" }: { outline?: boolean; children?: React.ReactNode }) {
  const settings = useStoreSettings();
  return <a href={settings.lineUrl} target="_blank" rel="noopener noreferrer" className={`pill ${outline ? "pill-outline" : "pill-pink"}`}><Icon name="chat" />{children}</a>;
}

export default function Home() {
  const settings = useStoreSettings();
  const products = useProducts();
  const [limit, setLimit] = useState(24);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sort, setSort] = useState("popular");
  const [color, setColor] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [availability, setAvailability] = useState<Record<number, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { cart, setCart } = useCart();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  useEffect(() => {
    if (!startDate || !endDate || endDate <= startDate) return;
    const controller = new AbortController();
    fetch(`/api/availability/range?${new URLSearchParams({ start: startDate, end: endDate })}`, { signal: controller.signal, cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "โหลดวันว่างไม่สำเร็จ"); return data.availability as Record<number, string>; }).then(setAvailability).catch(error => { if (error.name !== "AbortError") setAvailability({}); });
    return () => controller.abort();
  }, [startDate, endDate]);
  const visible = products.filter(p => {
    const rate = p.dailyRate;
    const matchesPrice = priceFilter === "all" || priceFilter === "ask" && rate == null || priceFilter === "under500" && rate != null && rate < 500 || priceFilter === "500to1000" && rate != null && rate >= 500 && rate < 1000 || priceFilter === "over1000" && rate != null && rate >= 1000;
    return (filter === "all" || p.category === filter) && (color === "all" || p.color === color) && matchesPrice && (availabilityFilter === "all" || availability[p.id] === availabilityFilter) && `${p.name} ${p.thai} ${p.tag} ${p.color} ${p.sku || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a,b) => sort === "name" ? a.thai.localeCompare(b.thai,"th") : sort === "new" ? b.id-a.id : a.id-b.id);
  function productCard(p: Product, featured = false) { return (
    <article className="shop-card" key={p.id}>
      <div className="shop-card-image"><Link href={`/products/${p.image}`} aria-label={`ดู ${p.thai}`}><FashionPhoto image={p.images[0]} label={p.thai} /></Link>{featured && <span className="shop-badge">แนะนำ</span>}</div>
      <div className="shop-card-info"><h3><Link href={`/products/${p.image}`}>{p.thai}</Link></h3><p className="shop-price"><strong>{p.dailyRate === null ? "สอบถามราคา" : `฿${p.dailyRate.toLocaleString("th-TH")}`}</strong>{p.dailyRate !== null && <span> / วัน</span>}</p>
      <Link href={`/products/${p.image}`} className="product-details">ดูรายละเอียด <UiIcon name="arrowRight" /></Link></div>
    </article>
  ); }
  return (<>
      <header className="site-header"><div className="container shop-header"><a href="#" className="shop-brand"><Logo /><span>CHARM BLESS Rental</span></a><nav className="desktop-nav" aria-label="เมนูหลัก"><a href="#recommended" className="nav-link nav-active">ชุดให้เช่า</a><a href="#how-to-rent" className="nav-link">วิธีเช่า</a><a href={settings.lineUrl} target="_blank" rel="noopener noreferrer" className="nav-link">ติดต่อร้าน</a></nav><div className="shop-header-actions"><BookingForm items={cart.filter(item => products.some(p => p.id === item.id)).map(item => ({id:item.id,name:products.find(p => p.id === item.id)!.thai,dailyRate:products.find(p => p.id === item.id)!.dailyRate,image:products.find(p => p.id === item.id)!.images[0]}))} initialStart={startDate} initialEnd={endDate} onRemove={id => setCart(items => items.filter(item => item.id !== id))} trigger={<button className="pill pill-outline cart-trigger"><Icon name="bag" />ตะกร้า{cart.length > 0 && <span>{cart.length}</span>}</button>} /><Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}><Dialog.Trigger className="search-button mobile-menu-trigger" aria-label="เปิดเมนู"><Icon name="menu" /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="mobile-menu-panel"><Dialog.Title className="text-lg font-semibold">CHARM BLESS Rental</Dialog.Title><Dialog.Description className="mt-2 text-sm text-slate-500">เลือกชุดที่ชอบสำหรับวันของคุณ</Dialog.Description><nav className="mobile-nav" aria-label="เมนูมือถือ">{[["ชุดให้เช่า","recommended"],["วิธีเช่า","how-to-rent"],["ติดต่อร้าน","contact"]].map(([name,id]) => <Dialog.Close key={id} asChild><a href={id === "contact" ? settings.lineUrl : `#${id}`} target={id === "contact" ? "_blank" : undefined} rel={id === "contact" ? "noopener noreferrer" : undefined}>{name}</a></Dialog.Close>)}</nav><Dialog.Close className="dialog-close" aria-label="ปิดเมนู"><Icon name="close" /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></div></div></header>
      <main>
        <section className="rental-banner cover-banner"><Image src={settings.heroImage} alt="Charm Bless Rental ชุดออกงานและเสื้อกันหนาว" unoptimized={settings.heroImage.startsWith("https://")} width={2048} height={683} loading="eager" fetchPriority="high" sizes="100vw" style={{width:"100%",height:"auto",display:"block"}} /><div className="container cover-copy"><h1>{settings.heroTitle.split("\n").map((line,index) => <span key={`${line}-${index}`}>{line}{index < settings.heroTitle.split("\n").length - 1 && <br />}</span>)}</h1><p>{settings.heroSubtitle.split("\n").map((line,index) => <span key={`${line}-${index}`}>{line}{index < settings.heroSubtitle.split("\n").length - 1 && <br />}</span>)}</p></div></section>
        <section id="recommended" className="container rental-shop"><button className="mobile-filter-toggle" aria-expanded={filtersOpen} aria-controls="catalog-extra-filters" onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="sliders" />ตัวกรอง{color !== "all" && <span>1</span>}<Icon name="chevron" /></button><div className={`shop-search ${filtersOpen ? "filters-expanded" : ""}`}><label className="shop-search-input"><Icon name="search" /><input aria-label="ค้นหาชุด" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชุด สี หรือสไตล์" /></label><div className="shop-dates"><Icon name="calendar" /><label>วันรับชุด<input type="date" aria-label="วันรับชุด" value={startDate} onChange={e => {setStartDate(e.target.value);setAvailability({});if(endDate && endDate <= e.target.value){setEndDate("");setAvailabilityFilter("all");}}} /></label><span>–</span><label>วันคืนชุด<input type="date" aria-label="วันคืนชุด" min={startDate || undefined} value={endDate} onChange={e => {setEndDate(e.target.value);setAvailability({});if(!e.target.value)setAvailabilityFilter("all");}} /></label></div><select className="shop-select" aria-label="เรียงสินค้า" value={sort} onChange={e => setSort(e.target.value)}><option value="popular">แนะนำ</option><option value="new">ใหม่ล่าสุด</option><option value="name">เรียงตามชื่อ</option></select></div>
          <div id="catalog-extra-filters" className={`catalog-filter-row ${filtersOpen ? "filters-expanded" : ""}`}><label>สี<select className="shop-select" value={color} onChange={e => setColor(e.target.value)}><option value="all">ทุกสี</option>{Array.from(new Set(products.map(p => p.color).filter(Boolean))).map(c => <option key={c} value={c}>{c}</option>)}</select></label><label>ราคาเช่า<select className="shop-select" value={priceFilter} onChange={e => setPriceFilter(e.target.value)}><option value="all">ทุกราคา</option><option value="under500">ต่ำกว่า 500 บาท/วัน</option><option value="500to1000">500–999 บาท/วัน</option><option value="over1000">1,000 บาทขึ้นไป/วัน</option><option value="ask">สอบถามราคา</option></select></label><label>วันว่าง<select className="shop-select" value={availabilityFilter} disabled={!startDate || !endDate || endDate <= startDate} onChange={e => setAvailabilityFilter(e.target.value)}><option value="all">ทุกสถานะ</option><option value="available">ว่างตลอดช่วง</option><option value="unavailable">มีวันที่เต็ม</option><option value="unknown">ยังไม่มีข้อมูลครบ</option></select></label><button className="clear-filters" onClick={() => {setQuery("");setFilter("all");setColor("all");setPriceFilter("all");setAvailabilityFilter("all");setStartDate("");setEndDate("");setSort("popular");}}>ล้างตัวกรอง</button></div><div className="filter-summary"><span>พบ {visible.length} รายการ{startDate && endDate && endDate > startDate ? ` · ระยะเวลาเช่า ${Math.round((Date.parse(endDate)-Date.parse(startDate))/86400000)} วัน` : ""}</span><span id="filter-data-note">{availabilityFilter !== "all" ? "วันว่างประเมินจากคิวที่ร้านบันทึกและคำขอที่ยืนยันแล้ว" : !startDate || !endDate ? "เลือกวันรับและวันคืนก่อนกรองวันว่าง" : "วันว่างที่ยังไม่มีข้อมูลครบจะแสดงเป็นสถานะไม่ทราบ"}</span></div>
          {(startDate || endDate) && <p className="date-note">คำขอจองยังต้องรอร้านตรวจสอบและยืนยันคิวกับราคา</p>}
          <Tabs.Root value={filter} onValueChange={setFilter}><Tabs.List className="filter-tabs shop-tabs" aria-label="หมวดสินค้า">{[["all","ทั้งหมด"], ...Array.from(new Set(products.map(p => p.category))).map(c => [c, categoryLabels[c] || c])].map(([value,label]) => <Tabs.Trigger value={value} key={value}>{label}</Tabs.Trigger>)}</Tabs.List><Tabs.Content value={filter}>
          {visible.length > 0 ? <><div className="section-heading shop-section-heading"><h2>กำลังฮิต</h2><a href="#all-products" className="text-link">ดูทั้งหมด <Icon name="arrow" /></a></div><div className="trending-grid">{visible.slice(0,4).map(p => productCard(p,true))}</div><div id="all-products" className="section-heading shop-section-heading all-products-heading"><h2>ชุดให้เช่าทั้งหมด <span>{visible.length} รายการ</span></h2></div><div className="product-grid">{visible.slice(0,limit).map(p => productCard(p))}</div>{visible.length > limit && <div style={{textAlign:"center",marginTop:24}}><button className="pill pill-outline" onClick={() => setLimit(n => n + 24)}>ดูสินค้าเพิ่มเติม ({visible.length - limit} รายการ)</button></div>}</> : <div className="empty-state"><p>ไม่พบรายการที่ตรงกับตัวเลือก</p><button className="pill pill-pink" onClick={() => {setQuery("");setFilter("all");setColor("all");}}>ดูชุดทั้งหมด</button></div>}
          </Tabs.Content></Tabs.Root>
        </section>
        <section className="container promotion-section" aria-label="โปรโมชั่น Charm Bless Rental">
          {settings.promotionImage && <Image className="promotion-image-banner" src={settings.promotionImage} alt="ภาพโปรโมชั่นร้าน Charm Bless Rental" width={1983} height={793} sizes="(max-width: 1280px) 100vw, 1280px" unoptimized={settings.promotionImage.startsWith("https://")} loading="lazy" style={{ width: "100%", height: "auto", aspectRatio: "1983 / 793", objectFit: "cover", borderRadius: 12 }} />}
        </section>
        <section id="how-to-rent" className="shop-how"><div className="container"><h2>{settings.howTitle}</h2><div className="steps">{settings.howSteps.map(({title,description},i) => <div className="step" key={`${title}-${i}`}><span className="step-number">{i+1}</span><Icon name={["calendar","bag","chat"][i] || "check"} /><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></div></section>
        <section id="contact" className="shop-contact container"><div><h2>{settings.contactTitle}</h2><p>{settings.contactDescription}</p></div><ContactButton>ติดต่อร้าน</ContactButton></section>
      </main>
      <footer><div className="container footer-inner"><a href="#" className="flex items-center gap-3"><Logo /><span className="brand-name">CHARM BLESS<span>RENTAL WARDROBE</span></span></a><p>{settings.footerTagline}</p><nav aria-label="เมนูท้ายหน้า"><a href="#recommended">คอลเลกชัน</a><a href="#how-to-rent">วิธีเช่า</a><a href={settings.lineUrl} target="_blank" rel="noopener noreferrer">ติดต่อเรา</a></nav></div><div className="container footer-bottom">© 2026 CHARM BLESS RENTAL<span>Curated with care.</span></div></footer>
    </>
  );
}
