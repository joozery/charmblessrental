import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import { font_400, font_700, font_latin_400, font_latin_700 } from "@/assets/fonts/noto-sans-thai";
import { dateLabel, itemPrice, money, quoteForRow, safeUrl, type DocRow } from "@/components/rental-document";

type BillDoc = Omit<DocRow, "createdAt"> & { status: string; createdAt: Date };
const ink = "#25212a", accent = "#a24d70", line = "#ddc5d1", soft = "#f3e4eb";
const W = 800;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) return new Response("Not found", { status: 404 });
  const row = await (await database()).collection<BillDoc>("bookingRequests").findOne({ billToken: token }, { projection: { _id: 1, status: 1, name: 1, phone: 1, address: 1, start: 1, end: 1, days: 1, deliveryFee: 1, quote: 1, items: 1, createdAt: 1 } });
  if (!row || !row.quote || row.status === "cancelled") return new Response("Not found", { status: 404 });
  const settings = await getStoreSettings();
  const doc: DocRow = { ...row, _id: String(row._id), createdAt: new Date(row.createdAt).toISOString() };
  const quote = quoteForRow(doc, settings.rentalDocument);
  const total = quote.rental + quote.deposit + quote.shipping;
  const qr = quote.qrImage ? safeUrl(quote.qrImage) : "";
  const logo = settings.logoImage && /^https?:/.test(settings.logoImage) ? settings.logoImage : "";
  const addressLines = Math.max(1, Math.ceil((doc.address || "").length / 34));
  const height = 770 + doc.items.length * 80 + addressLines * 30 + (qr ? 190 : 0) + 130;

  const card = (title: string, children: React.ReactNode, flex?: number) => <div style={{ display: "flex", flexDirection: "column", ...(flex ? { flex } : { flexShrink: 0 }), border: `1px solid ${line}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}><div style={{ display: "flex", padding: "8px 16px", background: soft, color: accent, fontSize: 20, fontWeight: 700 }}>{title}</div><div style={{ display: "flex", flexDirection: "column", padding: "10px 16px", gap: 6 }}>{children}</div></div>;
  const field = (label: string, value: string) => <div key={label} style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 16, color: "#7a6f78" }}>{label}</span><span style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.35 }}>{value}</span></div>;
  const sum = (label: string, value: string, strong = false) => <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 26 : 21, fontWeight: strong ? 700 : 400, color: strong ? accent : ink, ...(strong ? { borderTop: `1px solid ${line}`, paddingTop: 8, marginTop: 4 } : {}) }}><span>{label}</span><span>{value}</span></div>;

  return new ImageResponse(<div style={{ display: "flex", flexDirection: "column", width: W, height, padding: 32, gap: 16, background: "#fff", color: ink, fontFamily: "Noto Latin, Noto Sans Thai" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottom: `2px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>{logo && <img src={logo} width={64} height={64} style={{ objectFit: "contain" }} alt="" />}<div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 30, fontWeight: 700, color: accent }}>CHARM BLESS Rental</span><span style={{ fontSize: 14, color: "#777", letterSpacing: 3 }}>CLOTHES FOR SPECIAL MOMENTS</span></div></div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span style={{ fontSize: 30, fontWeight: 700 }}>ใบรายละเอียดการเช่า</span><span style={{ fontSize: 16, color: accent }}>{doc._id}</span></div>
    </div>
    <div style={{ display: "flex", gap: 14 }}>
      {card("ข้อมูลลูกค้า", [field("ชื่อ–นามสกุลผู้เช่า", doc.name), field("เบอร์โทรศัพท์", doc.phone), field("ที่อยู่สำหรับจัดส่ง", doc.address || "รับเองที่ร้าน")], 1.25)}
      {card("ข้อมูลการเช่า", [field("วันที่จอง", dateLabel(doc.createdAt)), field("วันใช้งาน", `${dateLabel(doc.start)} – ${dateLabel(doc.end)}`), field("ระยะเวลาเช่า", `${doc.days} วัน`), field("กำหนดคืน", dateLabel(doc.end))], 1)}
    </div>
    {card("รายการสินค้าเช่า", doc.items.map((item, index) => <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 0", borderBottom: index < doc.items.length - 1 ? `1px solid ${soft}` : "none" }}>
      <span style={{ display: "flex", width: 28, fontSize: 20, color: "#7a6f78" }}>{index + 1}</span>
      {item.image && /^https?:/.test(item.image) ? <img src={item.image} width={46} height={58} style={{ objectFit: "cover", borderRadius: 6 }} alt="" /> : <div style={{ display: "flex", width: 46, height: 58, borderRadius: 6, background: soft }} />}
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}><span style={{ fontSize: 21, fontWeight: 700 }}>{item.sku || item.name}</span><span style={{ fontSize: 16, color: "#7a6f78" }}>{item.name}</span></div>
      <span style={{ fontSize: 21, fontWeight: 700 }}>{itemPrice(item, doc.days) === null ? "สอบถาม" : `${money(itemPrice(item, doc.days)!)} บาท`}</span>
    </div>))}
    <div style={{ display: "flex", gap: 14 }}>
      {card("สรุปยอดค่าเช่า", [sum("ค่าเช่ารวม", money(quote.rental)), sum("เงินประกัน", money(quote.deposit)), sum("ค่าจัดส่ง", money(quote.shipping)), sum("ยอดรวมสุทธิ", `${money(total)} บาท`, true)], 1)}
      {card("ช่องทางชำระเงิน", [qr && <img key="qr" src={qr} width={150} height={150} style={{ alignSelf: "center", objectFit: "contain" }} alt="" />, field("ธนาคาร", quote.bank || "-"), field("เลขที่บัญชี", quote.accountNumber || "-"), field("ชื่อบัญชี", quote.accountName || "-")], 1)}
    </div>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 16px", borderRadius: 12, background: "#fff7e8", border: "1px solid #f3d79b", fontSize: 20 }}><span style={{ fontWeight: 700 }}>ส่งคืนภายในวันที่ {dateLabel(doc.end)} ก่อน 18:00 น.</span><span style={{ fontSize: 17, color: "#7a6f78" }}>โอนตามยอดสุทธิ แล้วส่งสลิปในแชทนี้ได้เลยค่ะ</span></div>
  </div>, { width: W, height, fonts: [
    { name: "Noto Sans Thai", data: font_400, weight: 400, style: "normal" }, { name: "Noto Sans Thai", data: font_700, weight: 700, style: "normal" },
    { name: "Noto Latin", data: font_latin_400, weight: 400, style: "normal" }, { name: "Noto Latin", data: font_latin_700, weight: 700, style: "normal" },
  ], headers: { "Cache-Control": "private, max-age=300" } });
}
