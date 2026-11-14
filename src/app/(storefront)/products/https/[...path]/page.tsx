import { notFound, redirect } from "next/navigation";
import { getCatalog } from "@/lib/catalog";

type LegacyImagePathProps = { params: Promise<{ path: string[] }> };

// Older storefront links used the full https image URL as the product slug.
// Keep those links working while new links use the numeric product id.
export default async function LegacyImagePathPage({ params }: LegacyImagePathProps) {
  const { path } = await params;
  const image = `https://${path.join("/")}`;
  const { products } = await getCatalog();
  const product = products.find(item => item.image === image);
  if (!product) notFound();
  redirect(`/products/${product.id}`);
}
