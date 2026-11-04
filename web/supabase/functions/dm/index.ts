// Supabase Edge Function "dm": súkromné správy. Na rozdiel od funkcie "game" nesťahuje kód z webu, lebo drží šifrovací kľúč.
// Nasadzuje sa zostavený súbor dist/index.js (npm run build:fn:dm). Logika a testy sú vo web/lib/dm.
import { createDmHandler } from "../../../lib/dm/server";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const handler = createDmHandler({
  URL: Deno.env.get("SUPABASE_URL")!,
  SERVICE: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ANON: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  DM_KEYS: Deno.env.get("DM_KEYS"),
  VAPID_PUBLIC: Deno.env.get("VAPID_PUBLIC"),
  VAPID_PRIVATE: Deno.env.get("VAPID_PRIVATE"),
  VAPID_SUBJECT: Deno.env.get("VAPID_SUBJECT"),
});

Deno.serve(handler);
