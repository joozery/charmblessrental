"use client";
import { Icon } from "./ui/icon";
import Image from "next/image";
import Link from "next/link";
import { useStoreSettings } from "@/components/store-settings-provider";
import { useState } from "react";
import RentalRules from "./rental-rules";
import ProductGallery from "./product-gallery";
import BookingForm from "./booking-form";
import ProductCalendar, { type CalendarChoice } from "./product-calendar";
import { useCart } from "./cart-provider";
import { useProducts } from "@/components/products-provider";
import type { Product } from "@/lib/products";
import { tiersOf } from "@/lib/pricing";

export default function ProductDetail({product:p}: {product: Product}) {
  const products = useProducts();
  const settings = useStoreSettings();
  const {cart,setCart}=useCart();
  const [choice,setChoice]=useState<CalendarChoice>({start:"",end:"",method:"",returnMethod:"parcel"});
  const item={id:p.id,name:p.thai,pricing:p.pricing,shippingFee:p.shippingFee,image:p.images[0]};
  const tiers=tiersOf(p.pricing);
  const inCart=cart.some(item => item.id===p.id);
  return <><header className="detail-header"><div className="container"><Link href="/" className="shop-brand"><Image src={settings.logoImage} alt="Charm Bless Rental" width={45} height={45} unoptimized={settings.logoImage.startsWith("https://")} />CHARM BLESS Rental</Link><Link href="/" className="text-link"><Icon name="arrowLeft" />กลับไปเลือกสินค้า</Link></div></header><main className="container product-detail-page"><nav className="detail-breadcrumb" aria-label="ตำแหน่งหน้า"><Link href="/">ชุดให้เช่า</Link><span>/ {p.tag} / {p.thai}</span></nav><div className="detail-layout"><div className="detail-gallery"><ProductGallery images={p.images} name={p.thai} /></div><div className="detail-info"><p className="eyebrow">CHARM BLESS · {p.tag}</p><h1>{p.name}</h1><p className="detail-thai">{p.thai}</p>{p.color && <p className="detail-color">สี {p.color}</p>}{p.size && <p className="detail-color">ไซซ์ {p.size}</p>}<div className="detail-pricing"><span>ราคาเช่า</span><strong>{tiers.length ? `฿${tiers[0].price.toLocaleString("th-TH")}` : "สอบถามราคา"} {tiers.length > 0 && <small>/ {tiers[0].days} วัน</small>}</strong><p>มัดจำ: {p.deposit == null ? "สอบถามร้าน" : `฿${p.deposit.toLocaleString("th-TH")}`} · เงื่อนไขคืนเงินตามที่ร้านกำหนด</p></div><p className="detail-delivery">{settings.shippingText.replaceAll("{{emsFee}}", settings.emsFee.toLocaleString("th-TH"))}</p><BookingForm items={[item]} initialStart={choice.start} initialEnd={choice.end} initialMethod={choice.method} initialReturn={choice.returnMethod} trigger={<button className="pill pill-pink w-full mt-5">ขอจองชุดนี้ <Icon name="arrowRight" /></button>} /><button className="pill pill-outline w-full mt-2" disabled={inCart} onClick={() => setCart(items => items.some(item => item.id===p.id) ? items : [...items,{id:p.id}])}>{inCart ? "เพิ่มในตะกร้าแล้ว" : "เพิ่มในตะกร้า"}</button><section className="detail-packages"><h2>แพ็คเกจเช่าหลายวัน — ยิ่งนานยิ่งคุ้ม</h2><div>{tiers.length ? tiers.map(tier => <article key={tier.days}><strong>เช่า {tier.days} วัน</strong><span>฿{tier.price.toLocaleString("th-TH")}{tier.days > 1 && <small> · ตกวันละ ฿{Math.round(tier.price / tier.days).toLocaleString("th-TH")}</small>}</span></article>) : [3,5].map(days => <article key={days}><strong>เช่า {days} วัน</strong><span>สอบถามราคาแพ็คเกจ</span></article>)}</div><p>{tiers.length ? `เช่าจำนวนวันที่ไม่มีในตาราง คิดราคาแพ็คเกจถัดไป${p.pricing?.extraPerDay != null ? ` · เกิน ${tiers[tiers.length - 1].days} วัน เพิ่มวันละ ฿${p.pricing.extraPerDay.toLocaleString("th-TH")}` : ""}` : "รอร้านแจ้งราคาและส่วนลดจริง"}</p></section><section className="detail-description"><h2>รายละเอียดสินค้า</h2><p>{p.description}</p><div className="flex flex-wrap gap-5"><Link href="/#how-to-rent" className="text-link">จองยังไง? <Icon name="arrowRight" /></Link><a href={settings.lineUrl} target="_blank" rel="noopener noreferrer" className="text-link">สอบถามร้านทาง LINE <Icon name="arrow" /></a></div></section><details className="detail-calendar" open><summary>ดูวันว่างและวางแผนวันเช่า</summary><ProductCalendar productId={p.id} value={choice} onChange={setChoice} /></details><details className="detail-terms"><summary>เงื่อนไขการเช่า & มัดจำ</summary><RentalRules rules={settings.rentalRules} /><p>จำนวนมัดจำและเงื่อนไขคืนมัดจำ กรุณาสอบถามร้านก่อนชำระเงิน</p><Link href="/#how-to-rent" className="text-link">อ่านวิธีเช่าทั้งหมด <Icon name="arrowRight" /></Link></details></div></div><section className="detail-related"><h2>ลุคอื่นที่คุณอาจชอบ</h2><div>{products.filter(item => item.id!==p.id).slice(0,8).map(item => <Link href={`/products/${item.image}`} key={item.id}><Image src={item.images[0]} alt={item.thai} width={240} height={360} /><h3>{item.thai}</h3></Link>)}</div></section></main></>;
}
