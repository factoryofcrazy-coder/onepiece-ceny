import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";
import { cookies } from "next/headers";
import { parseTcg, TCG_COOKIE, TcgProvider } from "@/lib/tcg";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Grand Line Tracker",
  description: "One Piece a Pokémon TCG – ceny v SK/CZ obchodoch, kolekcia, master sety a deckbuilder",
};
export const viewport: Viewport = { themeColor: "#06121f", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tcg = parseTcg((await cookies()).get(TCG_COOKIE)?.value);
  return (
    <html lang="sk" data-tcg={tcg}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Manrope:wght@400..800&family=Rye&display=swap"
        />
      </head>
      <body>
        <TcgProvider initial={tcg}>
          <AuthProvider>
            <Nav />
            <main className="wrap">{children}</main>
            <Footer />
          </AuthProvider>
        </TcgProvider>
      </body>
    </html>
  );
}
