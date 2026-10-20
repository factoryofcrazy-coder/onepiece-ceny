"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bar, CardImg, ColorDots, DataError, Foil, Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ownedByCode, useCollection } from "@/lib/collection";
import { Card, eur, MetaDeck, useCards, useMeta, usePrices } from "@/lib/data";
import { sb } from "@/lib/supabase";

type Missing = { code: string; n: number; card?: Card; unit: number | null };
type Scored = {
  deck: MetaDeck;
  have: number;
  total: number;
  pct: number;
  missing: Missing[];
  missingCost: number;
  unknown: number; // karty, ktoré v EN databáze ešte nie sú
};
type Arche = { leader: string; leaderCard?: Card; name: string; best: Scored; top8: number; wins: number; lists: number };

const SORTS = {
  ready: "Najbližšie k dokončeniu",
  cheap: "Najlacnejšie dokúpiť",
  meta: "Najsilnejšie v mete",
} as const;

export default function Recommend() {
  const { user, loading } = useAuth();
  const { data: cards, error: cErr } = useCards();
  const { data: meta, error: mErr } = useMeta();
  const { data: prices } = usePrices();
  const { qty, loading: qLoading } = useCollection(user?.id, false);
  const [sort, setSort] = useState<keyof typeof SORTS>("ready");
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const router = useRouter();
  const usd = prices?.fx?.USD ?? 1.12;
  const owned = useMemo(() => ownedByCode(qty), [qty]);
  const ownedTotal = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  // najlacnejšia verzia každej karty (na dokúpenie)
  const cheapest = useMemo(() => {
    const m = new Map<string, Card>();
    const price = (c: Card) => c.usd ?? (c.v ? 1e9 : 1e8); // bez ceny: radšej základná verzia
    cards?.cards.forEach((c) => {
      const cur = m.get(c.code);
      if (!cur || price(c) < price(cur)) m.set(c.code, c);
    });
    return m;
  }, [cards]);

  const archetypes = useMemo(() => {
    if (!meta || !cards) return [];
    const scored: Scored[] = meta.decks.map((deck) => {
      const missing: Missing[] = [];
      let have = 0, total = 1, unknown = 0;
      const lead = owned[deck.leader] ? 1 : 0;
      have += lead;
      if (!lead) {
        const c = cheapest.get(deck.leader);
        missing.push({ code: deck.leader, n: 1, card: c, unit: c?.usd != null ? c.usd / usd : null });
      }
      for (const [code, n] of Object.entries(deck.cards)) {
        total += n;
        const h = Math.min(n, owned[code] ?? 0);
        have += h;
        if (h < n) {
          const c = cheapest.get(code);
          if (!c) unknown += n - h;
          missing.push({ code, n: n - h, card: c, unit: c?.usd != null ? c.usd / usd : null });
        }
      }
      const missingCost = missing.reduce((s, m) => s + m.n * (m.unit ?? 0), 0);
      return { deck, have, total, pct: have / total, missing, missingCost, unknown };
    });
    const by = new Map<string, Arche>();
    for (const s of scored) {
      let a = by.get(s.deck.leader);
      if (!a) {
        a = { leader: s.deck.leader, leaderCard: cheapest.get(s.deck.leader), name: s.deck.leaderName, best: s, top8: 0, wins: 0, lists: 0 };
        by.set(s.deck.leader, a);
      }
      a.top8++;
      a.lists++;
      if (s.deck.placing === 1) a.wins++;
      if (s.pct > a.best.pct || (s.pct === a.best.pct && s.missingCost < a.best.missingCost)) a.best = s;
    }
    const list = [...by.values()];
    list.sort((x, y) =>
      sort === "ready"
        ? y.best.pct - x.best.pct || x.best.missingCost - y.best.missingCost
        : sort === "cheap"
          ? x.best.missingCost - y.best.missingCost || y.best.pct - x.best.pct
          : y.top8 - x.top8 || y.wins - x.wins,
    );
    return list;
  }, [meta, cards, owned, cheapest, usd, sort]);

  if (loading) return <Loading shape="tiles" />;
  if (!user) return <NeedLogin what="Odporúčanie deckov" />;
  if (cErr) return <DataError error={cErr} file="cards" />;
  if (mErr)
    return (
      <div className="empty warn">
        Turnajové decky sa teraz nepodarilo načítať ({mErr}). Skús to o chvíľu znova.
      </div>
    );
  if (!cards || !meta || qLoading) return <Loading what="Porovnávam turnajové decky s tvojou kolekciou" shape="tiles" />;

  const save = async (a: Arche) => {
    setSaving(a.leader);
    const d = a.best.deck;
    const { data, error } = await sb()
      .from("decks")
      .insert({
        name: `${a.name} – ${d.tournament}`.slice(0, 120),
        leader_id: d.leader,
        cards: d.cards,
        notes: `Podľa decku hráča ${d.player} (${d.placing}. miesto z ${d.players}), ${new Date(d.date).toLocaleDateString("sk-SK")}.`,
      })
      .select()
      .single();
    setSaving(null);
    if (!error && data) router.push(`/decky/${data.id}`);
  };

  return (
    <>
      <div className="head">
        <div>
          <Link href="/decky" className="small">
            ← Decky
          </Link>
          <h1>Čo si viem postaviť</h1>
          <p className="muted">
            {meta.decks.length} top 8 deckov z {meta.tournaments} najväčších turnajov za posledný mesiac (Limitless TCG),
            porovnaných s tvojimi {ownedTotal} kartami.
          </p>
        </div>
        <div className="seg">
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
            <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>
              {SORTS[k]}
            </button>
          ))}
        </div>
      </div>

      {ownedTotal === 0 && (
        <div className="empty">
          V kolekcii zatiaľ nemáš žiadne karty. <Link href="/import">Naimportuj ich z HoloDex</Link> alebo si ich označ v{" "}
          <Link href="/karty">Kartách</Link>.
        </div>
      )}

      <div className="recs">
        {archetypes.map((a, i) => {
          const b = a.best;
          const isOpen = open === a.leader;
          return (
            <article key={a.leader} className={`rec ${i === 0 ? "top" : ""}`} style={{ ["--d" as any]: `${Math.min(i, 8) * 50}ms` }}>
              <div className="rec-main">
                <Foil className="rec-leader">
                  {a.leaderCard ? <CardImg card={a.leaderCard} /> : <div className="cimg ph">{a.leader}</div>}
                </Foil>
                <div className="rec-body">
                  <div className="row gap wrapr">
                    {a.leaderCard && <ColorDots colors={a.leaderCard.colors} />}
                    <h2>{a.name}</h2>
                    <span className="muted small">{a.leader}</span>
                  </div>
                  <p className="small muted rec-meta">
                    {a.top8}× v top 8{a.wins ? `, ${a.wins}× víťaz` : ""}. Najbližší list: {b.deck.player},{" "}
                    {b.deck.placing}. miesto na {b.deck.tournament} ({b.deck.players} hráčov)
                  </p>
                  <div className="rec-progress">
                    <b>{Math.round(b.pct * 100)} %</b>
                    <Bar value={b.have} max={b.total} />
                    <span className="small muted">
                      {b.have}/{b.total} kariet
                    </span>
                  </div>
                  <p className="rec-missing">
                    {b.missing.length === 0 ? (
                      <span className="okc">Máš všetko – môžeš hrať hneď.</span>
                    ) : (
                      <>
                        Chýba {b.total - b.have} kariet za <b>{eur(b.missingCost)}</b>
                        {b.unknown > 0 && <span className="muted small"> (+ {b.unknown} kariet bez ceny)</span>}
                      </>
                    )}
                  </p>
                  <div className="row gap wrapr">
                    <button className="btn sm" disabled={saving === a.leader} onClick={() => save(a)}>
                      {saving === a.leader ? "Ukladám…" : "Uložiť ako môj deck"}
                    </button>
                    {b.missing.length > 0 && (
                      <button className="btn ghost sm" onClick={() => setOpen(isOpen ? null : a.leader)}>
                        {isOpen ? "Skryť chýbajúce" : "Čo mi chýba"}
                      </button>
                    )}
                    <a
                      className="btn ghost sm"
                      href={`https://play.limitlesstcg.com/tournament/${b.deck.tournamentId}/standings`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Turnaj na Limitless
                    </a>
                  </div>
                </div>
              </div>
              {isOpen && (
                <ul className="rec-list">
                  {b.missing
                    .sort((x, y) => (y.unit ?? 0) * y.n - (x.unit ?? 0) * x.n)
                    .map((m) => (
                      <li key={m.code}>
                        <span className="cost">{m.n}×</span>
                        <span className="grow">
                          {m.card?.name ?? m.code} <span className="muted tiny">{m.code}</span>
                        </span>
                        <span className="muted small">{m.unit != null ? `${eur(m.unit)}/ks` : "bez ceny"}</span>
                        <b className="small">{m.unit != null ? eur(m.unit * m.n) : "–"}</b>
                      </li>
                    ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
