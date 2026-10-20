import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Grand Line Tracker",
  description: "One Piece TCG – ceny v SK/CZ obchodoch, kolekcia, master sety a deckbuilder",
};
export const viewport: Viewport = { themeColor: "#0f1420", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk">
      <body>
        <AuthProvider>
          <Nav />
          <main className="wrap">{children}</main>
          <footer className="wrap foot">
            Ceny: SK/CZ/DE/AT/JP obchody (scraper) · Karty a ceny kariet: optcgapi.com (TCGplayer) · Nie je
            spojené s Bandai.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
