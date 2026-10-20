// Verejné hodnoty (publishable kľúč je bezpečné mať v prehliadači – dáta chráni RLS v databáze).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wpmarrzqzcfugtfjitot.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E2xvBPHdCd4b76kzGJ89bw_8-5R4ee6";
export const OLD_SITE = "https://factoryofcrazy-coder.github.io/onepiece-ceny/";
export const GH_REPO = "factoryofcrazy-coder/onepiece-ceny";
