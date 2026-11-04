import type { MetadataRoute } from "next";

// PWA – web sa dá pridať na plochu ako appka (celá obrazovka, skratka rovno do skenera)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grand Line Tracker",
    short_name: "Grand Line",
    description: "One Piece a Pokémon TCG – ceny v SK/CZ obchodoch, skener kariet, zbierka a decky",
    lang: "sk",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06121f",
    theme_color: "#06121f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Skener kariet", short_name: "Skener", url: "/skener", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ceny", url: "/" },
      { name: "Zbierka", url: "/zbierka" },
    ],
  };
}
