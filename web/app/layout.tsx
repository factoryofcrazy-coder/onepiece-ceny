import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import { THEME_INIT } from "@/lib/theme-init";
import { ChatProvider } from "@/lib/chat";
import ChatDock from "@/components/chat/ChatDock";
import AppChrome from "@/components/AppChrome";
import { cookies } from "next/headers";
import { TcgProvider } from "@/lib/tcg";
import { parseTcg, TCG_COOKIE } from "@/lib/tcg-shared";
import Footer from "@/components/Footer";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  title: "Grand Line Tracker",
  description: "One Piece a Pokémon TCG – ceny v SK/CZ obchodoch, zbierka, master sety a deckbuilder",
  applicationName: "Grand Line Tracker",
  // iPhone: „Pridať na plochu“ → appka cez celú obrazovku
  appleWebApp: { capable: true, title: "Grand Line", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0b0a14", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tcg = parseTcg((await cookies()).get(TCG_COOKIE)?.value);
  return (
    <html lang="sk" data-tcg={tcg} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
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
            <ChatProvider>
              <AppChrome>
                <main className="wrap">{children}</main>
                <Footer />
              </AppChrome>
              <ChatDock />
              <TabBar />
            </ChatProvider>
          </AuthProvider>
        </TcgProvider>
      </body>
    </html>
  );
}
