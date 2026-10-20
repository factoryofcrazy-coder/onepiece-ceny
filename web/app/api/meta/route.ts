// Turnajové decklisty One Piece z Limitless TCG (verejné API, bez kľúča).
// Berie top 8 z najväčších turnajov za posledných 30 dní. Vercel CDN drží výsledok 12 h.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://play.limitlesstcg.com/api";
const DAYS = 30;
const MAX_TOURNAMENTS = 14;
const MIN_PLAYERS = 16;
const TOP = 8;

type LCard = { count: number; name: string; set: string; number: string };
type Standing = {
  name: string;
  placing: number | null;
  record?: { wins: number; losses: number; ties: number };
  deck?: { id: string; name: string };
  decklist?: { leader?: { name: string; set: string; number: string }; character?: LCard[]; event?: LCard[]; stage?: LCard[] };
};

export type MetaDeck = {
  leader: string; // OP09-042
  leaderName: string;
  player: string;
  placing: number;
  tournament: string;
  tournamentId: string;
  date: string;
  players: number;
  cards: Record<string, number>; // bez leadera
};

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(API + path, {
      headers: { Accept: "application/json", "User-Agent": "grand-line-tracker/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

const code = (c: { set: string; number: string }) => `${c.set}-${c.number}`.toUpperCase();

export async function GET() {
  const list =
    (await get<{ id: string; name: string; date: string; players: number }[]>(`/tournaments?game=OP&limit=100`)) ?? [];
  const since = Date.now() - DAYS * 864e5;
  const picked = list
    .filter((t) => t.players >= MIN_PLAYERS && new Date(t.date).getTime() >= since)
    .sort((a, b) => b.players - a.players)
    .slice(0, MAX_TOURNAMENTS);

  const decks: MetaDeck[] = [];
  const results = await Promise.all(picked.map((t) => get<Standing[]>(`/tournaments/${t.id}/standings`)));
  results.forEach((standings, i) => {
    const t = picked[i];
    if (!standings) return;
    const ranked = standings
      .filter((s) => s.decklist?.leader)
      .map((s, k) => ({ s, place: s.placing ?? k + 1 }))
      .sort((a, b) => a.place - b.place)
      .slice(0, TOP);
    for (const { s, place } of ranked) {
      const dl = s.decklist!;
      const cards: Record<string, number> = {};
      for (const c of [...(dl.character ?? []), ...(dl.event ?? []), ...(dl.stage ?? [])])
        cards[code(c)] = (cards[code(c)] ?? 0) + (c.count || 0);
      const total = Object.values(cards).reduce((a, b) => a + b, 0);
      if (total < 40) continue; // neúplný decklist
      decks.push({
        leader: code(dl.leader!),
        leaderName: dl.leader!.name,
        player: s.name,
        placing: place,
        tournament: t.name,
        tournamentId: t.id,
        date: t.date,
        players: t.players,
        cards,
      });
    }
  });

  if (!decks.length)
    return Response.json(
      { error: "Limitless TCG teraz nevrátil žiadne decklisty." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { updated: new Date().toISOString(), tournaments: picked.length, decks },
    { headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" } },
  );
}
