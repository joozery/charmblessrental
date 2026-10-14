import { Suspense } from "react";
import SocialFloating from "@/components/social-floating";
import MobileNavigation from "@/components/mobile-navigation";
import { CartProvider } from "@/components/cart-provider";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai, Geist_Mono } from "next/font/google";
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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export const metadata: Metadata = {
  title: "Charmbless Rental",
  description: "Charmbless Rental — Next.js, Radix UI and Tailwind CSS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      className={`${notoSansThai.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ position: "relative" }}><CartProvider>{children}<SocialFloating /><Suspense fallback={null}><MobileNavigation /></Suspense></CartProvider></body>
    </html>
  );
}
