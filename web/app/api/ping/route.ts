// Vercel Cron (vercel.json) to volá raz denne → free Supabase projekt sa neuspí (uspáva sa po 7 dňoch nečinnosti).
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  return Response.json({ supabase: r.status, body: await r.text() }, { headers: { "Cache-Control": "no-store" } });
}
