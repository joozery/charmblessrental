import { publicProduct } from "@/lib/products";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/product-store";
import ProductDetail from "@/components/product-detail";

type ProductPageProps = { params: Promise<{ slug: string }> };

async function ProductContent({ params }: ProductPageProps) {
  const { slug } = await params;
  const products = await getProducts();
  const product = products.filter(p => p.active !== false && (p.stock ?? 1) > 0).find((item) => item.image === slug);
  if (!product) notFound();
  return <ProductDetail product={publicProduct(product)} />;
}

export default function Page({ params }: ProductPageProps) {
  return (
    <Suspense fallback={<main className="container py-8 text-sm text-slate-500" role="status">กำลังโหลดรายละเอียดสินค้า…</main>}>
      <ProductContent params={params} />
    </Suspense>
  );
}
