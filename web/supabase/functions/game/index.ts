// Supabase Edge Function „game“ – tenký nakladač. Celá logika (engine, skripty kariet, pravidlá servera)
// je v module /engine/server.js na webe, ktorý sa zostavuje spolu s webom (npm run build:engine).
// Funkcia ho načíta, overí si ETag každú minútu a zavolá createHandler. Zdroj modulu: web/lib/engine/server.ts
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const SITE = "https://grand-line-tracker-gilt.vercel.app";
const env = {
  URL: Deno.env.get("SUPABASE_URL")!,
  SERVICE: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ANON: Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_E2xvBPHdCd4b76kzGJ89bw_8-5R4ee6",
  SITE,
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let cached: { at: number; etag: string | null; handler: (r: Request) => Promise<Response> } | null = null;

async function handler() {
  if (cached && Date.now() - cached.at < 60_000) return cached.handler;
  const r = await fetch(`${SITE}/engine/server.js`, { headers: cached?.etag ? { "If-None-Match": cached.etag } : {} });
  if (r.status === 304 && cached) {
    cached.at = Date.now();
    return cached.handler;
  }
  if (!r.ok) {
    if (cached) return cached.handler;
    throw new Error(`engine ${r.status}`);
  }
  const code = await r.text();
  const mod = new Function(`${code}\n;return OPServer;`)();
  cached = { at: Date.now(), etag: r.headers.get("etag"), handler: mod.createHandler(env) };
  return cached.handler;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    return await (await handler())(req);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Server hry je dočasne nedostupný." }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
