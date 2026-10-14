import { Suspense } from "react";
import { notFound } from "next/navigation";
import { products } from "@/lib/products";
import ProductDetail from "@/components/product-detail";

type ProductPageProps = { params: Promise<{ slug: string }> };

async function ProductContent({ params }: ProductPageProps) {
  const { slug } = await params;
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
