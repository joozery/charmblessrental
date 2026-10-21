import { cacheLife, cacheTag } from "next/cache";
import { publicProduct } from "@/lib/products";
import { readProducts } from "@/lib/product-store";
import { getStoreSettings } from "@/lib/store-settings";

// Shared by the storefront layout and product pages; cleared by revalidateTag("catalog") on admin saves.
export async function getCatalog() {
  "use cache";
  cacheTag("catalog");
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const [storedProducts, settings] = await Promise.all([readProducts(), getStoreSettings()]);
  const products = storedProducts.filter(p => p.active !== false && (p.stock ?? 1) > 0).map(product => publicProduct(product, settings.rentalPricing));
  return { products, settings };
}
