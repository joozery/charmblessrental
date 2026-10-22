import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import ProductDetail from "@/components/product-detail";

type ProductPageProps = { params: Promise<{ slug: string }> };

// Every product page is built ahead as static HTML; one added later renders on its first visit.
export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map(product => ({ slug: product.image }));
}

async function ProductContent({ params }: ProductPageProps) {
  const { slug } = await params;
  const { products } = await getCatalog();
  const product = products.find((item) => item.image === slug);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}

export default function Page({ params }: ProductPageProps) {
  return (
    <Suspense fallback={<main className="container py-8 text-sm text-slate-500" role="status">กำลังโหลดรายละเอียดสินค้า…</main>}>
      <ProductContent params={params} />
    </Suspense>
  );
}
