import { Suspense } from "react";
import { ProductsProvider } from "@/components/products-provider";
import { CartProvider } from "@/components/cart-provider";
import SocialFloating from "@/components/social-floating";
import MobileNavigation from "@/components/mobile-navigation";
import { StoreSettingsProvider } from "@/components/store-settings-provider";
import { getCatalog } from "@/lib/catalog";
// The catalog is cached ("use cache"), so it is part of the static HTML: no loading screen in front of the shop.
export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { products, settings } = await getCatalog();
  return <StoreSettingsProvider settings={settings}><ProductsProvider products={products}><CartProvider>{children}<Suspense fallback={null}><SocialFloating /><MobileNavigation /></Suspense></CartProvider></ProductsProvider></StoreSettingsProvider>;
}
