import { publicProduct } from "@/lib/products";
import { Suspense } from "react";
import { getProducts } from "@/lib/product-store";
import { ProductsProvider } from "@/components/products-provider";
import { CartProvider } from "@/components/cart-provider";
import SocialFloating from "@/components/social-floating";
import MobileNavigation from "@/components/mobile-navigation";
import { StoreSettingsProvider } from "@/components/store-settings-provider";
import { getStoreSettings } from "@/lib/store-settings";
async function Catalog({ children }: { children: React.ReactNode }) {
  const [storedProducts, settings] = await Promise.all([getProducts(), getStoreSettings()]);
  const products = storedProducts.filter(p => p.active !== false && (p.stock ?? 1) > 0).map(publicProduct);
  return <StoreSettingsProvider settings={settings}><ProductsProvider products={products}><CartProvider>{children}<SocialFloating /><Suspense fallback={null}><MobileNavigation /></Suspense></CartProvider></ProductsProvider></StoreSettingsProvider>;
}
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="container py-8" role="status">กำลังโหลดสินค้า…</main>}><Catalog>{children}</Catalog></Suspense>;
}
