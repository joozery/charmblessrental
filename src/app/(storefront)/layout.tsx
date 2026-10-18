import { publicProduct } from "@/lib/products";
import { Suspense } from "react";
import { connection } from "next/server";
import { readProducts } from "@/lib/product-store";
import { ProductsProvider } from "@/components/products-provider";
import { CartProvider } from "@/components/cart-provider";
import SocialFloating from "@/components/social-floating";
import MobileNavigation from "@/components/mobile-navigation";
import { StoreSettingsProvider } from "@/components/store-settings-provider";
import { getStoreSettings } from "@/lib/store-settings";
import { cacheLife, cacheTag } from "next/cache";
async function getCatalog() {
  "use cache";
  cacheTag("catalog");
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const [storedProducts, settings] = await Promise.all([readProducts(), getStoreSettings()]);
  const products = storedProducts.filter(p => p.active !== false && (p.stock ?? 1) > 0).map(publicProduct);
  return { products, settings };
}
async function Catalog({ children }: { children: React.ReactNode }) {
  await connection();
  const { products, settings } = await getCatalog();
  return <StoreSettingsProvider settings={settings}><ProductsProvider products={products}><CartProvider>{children}<SocialFloating /><Suspense fallback={null}><MobileNavigation /></Suspense></CartProvider></ProductsProvider></StoreSettingsProvider>;
}
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="container py-8" role="status">กำลังโหลดสินค้า…</main>}><Catalog>{children}</Catalog></Suspense>;
}
