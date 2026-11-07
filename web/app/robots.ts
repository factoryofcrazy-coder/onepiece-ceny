import type { MetadataRoute } from "next";

const SITE = "https://www.grand-line.eu";

// AI crawlery, ktoré zbierajú obsah na trénovanie modelov – tie nechceme.
const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Bytespider",
  "Meta-ExternalAgent",
  "Amazonbot",
  "cohere-ai",
  "Diffbot",
];

// Vyhľadávače smú na verejné stránky (kvôli návštevnosti z Google), nie na dátové API a súkromné stránky.
// Pozn.: robots.txt je len prosba – slušné roboty ho dodržia, scraper ho môže ignorovať.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_BOTS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/ucet", "/zbierka", "/spravy", "/chat", "/login", "/nove-heslo", "/import", "/skener"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
