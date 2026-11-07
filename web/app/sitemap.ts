import type { MetadataRoute } from "next";

const SITE = "https://www.grand-line.eu";

// Verejné stránky pre vyhľadávače (súkromné a dátové adresy sú zakázané v robots.ts).
const PAGES: [string, number][] = [
  ["/", 1],
  ["/karty", 0.9],
  ["/boxy", 0.9],
  ["/ceny", 0.9],
  ["/pohyby", 0.8],
  ["/trh", 0.7],
  ["/novinky", 0.7],
  ["/master-sety", 0.6],
  ["/decky", 0.6],
  ["/trhovisko", 0.6],
  ["/hra", 0.5],
  ["/rebricek", 0.5],
  ["/aplikacia", 0.3],
  ["/report", 0.2],
  ["/sukromie", 0.1],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.map(([path, priority]) => ({ url: `${SITE}${path}`, lastModified: now, changeFrequency: "daily", priority }));
}
