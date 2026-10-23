import { Suspense } from "react";
import { ProductsProvider } from "@/components/products-provider";
import { CartProvider } from "@/components/cart-provider";
import SocialFloating from "@/components/social-floating";
import MobileNavigation from "@/components/mobile-navigation";
import { StoreSettingsProvider } from "@/components/store-settings-provider";
import { getCatalog } from "@/lib/catalog";

// Keep catalog data below a Suspense boundary so shared storefront layouts can
// remain instant while a product URL is being resolved during navigation.
async function StorefrontProviders({ children }: { children: React.ReactNode }) {
  const { products, settings } = await getCatalog();
  return <StoreSettingsProvider settings={settings}><ProductsProvider products={products}><CartProvider>{children}<Suspense fallback={null}><SocialFloating /><MobileNavigation /></Suspense></CartProvider></ProductsProvider></StoreSettingsProvider>;
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="container py-8 text-sm text-slate-500" role="status">กำลังโหลดหน้าร้าน…</main>}><StorefrontProviders>{children}</StorefrontProviders></Suspense>;
}
