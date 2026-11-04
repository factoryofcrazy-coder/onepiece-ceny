// Verejné hodnoty (publishable kľúč je bezpečné mať v prehliadači – dáta chráni RLS v databáze).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wpmarrzqzcfugtfjitot.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E2xvBPHdCd4b76kzGJ89bw_8-5R4ee6";
// Hra je zatiaľ len pre nás – verejne sa ukazuje teaser „Pripravujeme“. Prepni na true, keď ju spustíme.
export const GAME_PUBLIC = true;
// Súkromné správy sa zapínajú premennou vo Verceli až po spustení migrácie, kľúča a funkcie (docs/spravy/NASADENIE.md).
export const DM_ENABLED = process.env.NEXT_PUBLIC_DM_ENABLED === "1";
