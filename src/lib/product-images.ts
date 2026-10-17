export const R2_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://pub-f85d0f916ffe4c5fb86eaf0357525b4e.r2.dev").replace(/\/$/, "");
export function isProductImage(value: string) {
  if (value === "/images/product-placeholder.svg") return true;
  if (value.includes("..")) return false;
  if (/^\/images\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp|avif)$/.test(value)) return true;
  if (!value.startsWith(`${R2_PUBLIC_URL}/products/`)) return false;
  return /^[a-f0-9-]+\.(png|jpg|webp)$/.test(value.slice(`${R2_PUBLIC_URL}/products/`.length));
}
