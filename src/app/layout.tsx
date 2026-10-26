import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Noto_Sans_Thai } from "next/font/google";
import { getStoreSettings } from "@/lib/store-settings";
import { Suspense } from "react";
import "./catalog.css";
import "@/components/booking.css";
import "@/components/cover.css";
import "@/components/catalog-filters.css";
import "@/components/promotion.css";
import "@/components/product-detail.css";
import "@/components/mobile-app.css";
import "@/components/sample-prices.css";
import "@/components/product-gallery.css";
import "@/components/social-rules.css";
import "@/components/gallery-mobile-fix.css";
import "@/components/availability.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export const metadata: Metadata = {
  title: "Charmbless Rental",
  description: "Charmbless Rental — Next.js, Radix UI and Tailwind CSS",
};

async function DynamicFavicon() {
  await connection();
  const settings = await getStoreSettings();
  const icon = settings.faviconImage || settings.logoImage;
  return <><link rel="icon" href={icon} /><link rel="shortcut icon" href={icon} /><link rel="apple-touch-icon" href={icon} /></>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      className={`${notoSansThai.variable} ${notoSansThai.className} h-full antialiased`}
    >
      <head><Suspense fallback={<link rel="icon" href="/exam/logo.jpg" />}><DynamicFavicon /></Suspense></head>
      <body className="min-h-full flex flex-col font-sans" style={{ position: "relative" }}>{children}</body>
    </html>
  );
}
