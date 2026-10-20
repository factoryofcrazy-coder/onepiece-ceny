import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Grand Line Tracker",
  description: "One Piece TCG – ceny v SK/CZ obchodoch, kolekcia, master sety a deckbuilder",
};
export const viewport: Viewport = { themeColor: "#06121f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Manrope:wght@400..800&family=Rye&display=swap"
        />
      </head>
      <body>
        <AuthProvider>
          <Nav />
          <main className="wrap">{children}</main>
          <footer className="wrap foot">
            Ceny zo SK, CZ, DE, AT a JP obchodov. Karty a ich ceny z optcgapi.com (TCGplayer). Neoficiálna
            stránka, nie je spojená s Bandai.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
