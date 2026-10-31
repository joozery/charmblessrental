import { notFound } from "next/navigation";
import { pageAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/product-store";
import { depositFor, effectivePricing } from "@/lib/pricing";
import { getStoreSettings } from "@/lib/store-settings";
import NewBookingForm, { type EditBookingInitial } from "../../new/new-booking-form";

export const instant = false;

type Params = { params: Promise<{ id: string }> };
type Booking = { _id: string; status: string; name?: string; phone?: string; address?: string; pin?: string; note?: string; start: string; end: string; method: string; schedule?: { returnMethod?: string }; payment?: "unpaid" | "paid"; quote?: { rental?: number; deposit?: number; shipping?: number; discountCode?: string }; deliveryFee?: number; items: { id: number; quantity?: number; rentalPrice?: number | null; dailyRate?: number | null; deposit?: number | null; depositPrice?: number | null }[]; shipment?: unknown; returned?: unknown };

export default async function EditBookingPage({ params }: Params) {
  await pageAdmin("bookings");
  const { id } = await params;
  const db = await (await import("@/lib/mongodb")).database();
  const booking = await db.collection<Booking>("bookingRequests").findOne({ _id: id });
  if (!booking || booking.status === "cancelled" || booking.shipment || booking.returned) notFound();
  const [products, settings] = await Promise.all([getProducts(), getStoreSettings()]);
  const productById = new Map(products.map(product => [product.id, product]));
  const days = Math.max(1, Math.round((Date.parse(`${booking.end}T00:00:00Z`) - Date.parse(`${booking.start}T00:00:00Z`)) / 86400000) + 1);
  const initial: EditBookingInitial = { id, name: booking.name || "", phone: booking.phone || "", address: booking.address || "", pin: booking.pin || "", note: booking.note || "", start: booking.start, end: booking.end, method: booking.method, returnMethod: booking.schedule?.returnMethod || "parcel", rental: booking.quote?.rental ?? 0, deposit: booking.quote?.deposit ?? 0, shipping: booking.quote?.shipping ?? booking.deliveryFee ?? 0, discountCode: booking.quote?.discountCode, payment: booking.payment, items: booking.items.map(item => { const product = productById.get(item.id); return { id: item.id, quantity: item.quantity || 1, rental: item.rentalPrice ?? (product?.dailyRate == null ? null : product.dailyRate * days), deposit: item.depositPrice ?? item.deposit ?? (product ? depositFor(product, settings.categoryDeposits) : 0) }; }) };
  return <NewBookingForm editId={id} initial={initial} products={products.filter(product => product.active !== false && ((product.stock ?? 0) > 0 || booking.items.some(item => item.id === product.id))).map(product => ({ id: product.id, name: product.thai || product.name, sku: product.sku || "", category: product.category, price: product.dailyRate, pricing: effectivePricing(product, settings.rentalPricing, settings.extraDayRates), deposit: depositFor(product, settings.categoryDeposits) || settings.rentalDocument.deposit, shippingFee: product.shippingFee ?? null, stock: product.stock ?? 0, gapDays: product.gapDays ?? null }))} methods={settings.shippingOptions.filter(option => option.enabled).map(option => ({ id: option.id, label: option.label, description: option.description, fee: option.fee, standard: option.standard }))} shipping={{ options: settings.shippingOptions, free: settings.freeShipping }} verification={settings.verification} messenger={{ enabled: settings.messenger.enabled, label: "แมสเซนเจอร์ (Grab / LINE MAN)", description: settings.messenger.description, inBill: settings.messenger.inBill }} />;
}
