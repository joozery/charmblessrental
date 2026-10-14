"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { Dialog } from "radix-ui";

export default function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active,setActive]=useState(0);
  const [open,setOpen]=useState(false);
  const [zoom,setZoom]=useState(false);
  const touch=useRef<number | null>(null);
  function move(direction:number) {setActive(index => (index+direction+images.length)%images.length);setZoom(false);}
  return <Dialog.Root open={open} onOpenChange={value => {setOpen(value);setZoom(false);}}><div className="product-photo-gallery"><Dialog.Trigger asChild><button type="button" className="gallery-main" aria-label={`เปิดภาพเต็ม ${name}`}><Image src={images[active]} alt={`${name} ภาพ ${active+1}`} width={1024} height={1536} loading="eager" sizes="(max-width: 767px) 100vw, 50vw" /><span>⤢ ดูรูปเต็ม · {active+1}/{images.length}</span></button></Dialog.Trigger>{images.length > 1 && <div className="gallery-thumbnails">{images.map((src,index) => <button key={`${src}-${index}`} aria-label={`ดูภาพที่ ${index+1}`} aria-pressed={active===index} onClick={() => setActive(index)}><Image src={src} alt="" width={80} height={100} /></button>)}</div>}
    <Dialog.Portal><Dialog.Overlay className="gallery-overlay" /><Dialog.Content className="gallery-viewer" onKeyDown={event => {if(event.key==="ArrowLeft"){event.preventDefault();move(-1);}if(event.key==="ArrowRight"){event.preventDefault();move(1);}}}><Dialog.Title className="sr-only">ภาพสินค้า {name}</Dialog.Title><Dialog.Description className="sr-only">ใช้ปุ่มลูกศรหรือปัดซ้ายขวาเพื่อเปลี่ยนภาพ กด Escape เพื่อปิด</Dialog.Description><div className="gallery-toolbar"><span>{active+1} / {images.length}</span><a href={images[active]} target="_blank" rel="noopener noreferrer" className="gallery-original">ต้นฉบับ ↗</a><button onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? "ย่อภาพ" : "ขยายภาพ"}</button><Dialog.Close aria-label="ปิดภาพเต็ม">✕</Dialog.Close></div><div className={`gallery-stage ${zoom ? "is-zoomed" : ""}`} onTouchStart={e => {touch.current=e.touches[0].clientX;}} onTouchEnd={e => {if(!zoom && touch.current!==null){const distance=e.changedTouches[0].clientX-touch.current;if(Math.abs(distance)>60)move(distance<0 ? 1:-1);}touch.current=null;}}><Image src={images[active]} alt={`${name} ภาพ ${active+1}`} width={1024} height={1536} sizes="100vw" /></div>{images.length > 1 && <><button className="gallery-previous" aria-label="ภาพก่อนหน้า" onClick={() => move(-1)}>‹</button><button className="gallery-next" aria-label="ภาพถัดไป" onClick={() => move(1)}>›</button></>}<p className="gallery-caption">{name}</p></Dialog.Content></Dialog.Portal>
  </div></Dialog.Root>;
}
