"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardImg, CardModal, ColorDots, DataError, Loading, NeedLogin } from "@/components/ui";
import { loadProfiles, useAuth } from "@/lib/auth";
import { ownedByCode, useCollection } from "@/lib/collection";
import { Card, COLOR_SK, COLORS, eur, TYPE_SK, useCards, usePrices } from "@/lib/data";
import { sb } from "@/lib/supabase";
import type { Deck } from "../page";

const unlimited = (c: Card) => /any number of (this card|cards with this card name)/i.test(c.text);

export default function DeckEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const usd = prices?.fx?.USD ?? 1.12;
  const { qty } = useCollection(user?.id, false);
  const owned = useMemo(() => ownedByCode(qty), [qty]);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [cost, setCost] = useState("");
  const [color, setColor] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [open, setOpen] = useState<Card | null>(null);
  const [txt, setTxt] = useState<string | null>(null);
  const saveT = useRef<any>(null);

  useEffect(() => {
    if (!user) return;
    sb()
      .from("decks")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setStatus("Deck neexistuje.");
        setDeck(data as Deck);
        loadProfiles().then((p) => setOwner(p.find((x) => x.id === data.user_id)?.username ?? ""));
      });
  }, [id, user]);

  // herný kód → základná verzia karty
  const byCode = useMemo(() => {
    const m = new Map<string, Card>();
    data?.cards.forEach((c) => {
      const cur = m.get(c.code);
      if (!cur || (cur.v && !c.v)) m.set(c.code, c);
    });
    return m;
  }, [data]);

  if (loading) return <Loading />;
  if (!user) return <NeedLogin what="Deckbuilder" />;
  if (error) return <DataError error={error} file="cards" />;
  if (!data || !deck) return <Loading what={status || "Načítavam deck"} />;

  const editable = deck.user_id === user.id;
  const leader = deck.leader_id ? byCode.get(deck.leader_id) : undefined;
  const entries = Object.entries(deck.cards || {})
    .map(([code, n]) => ({ code, n, c: byCode.get(code) }))
    .filter((e) => e.n > 0);
  const total = entries.reduce((s, e) => s + e.n, 0);

  const update = (patch: Partial<Deck>) => {
    if (!editable) return;
    const next = { ...deck, ...patch };
    setDeck(next);
    setStatus("ukladám…");
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      const { error } = await sb()
        .from("decks")
        .update({
          name: next.name,
          leader_id: next.leader_id,
          cards: next.cards,
          notes: next.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", next.id);
      setStatus(error ? `chyba: ${error.message}` : "uložené ✓");
    }, 600);
  };

  const setCount = (code: string, n: number) => {
    const c = byCode.get(code);
    const max = c && unlimited(c) ? 50 : 4;
    const cards = { ...deck.cards };
    n = Math.max(0, Math.min(max, n));
    if (n) cards[code] = n;
    else delete cards[code];
    update({ cards });
  };

  // ---------- kontrola pravidiel
  const problems: string[] = [];
  if (!leader) problems.push("Chýba leader.");
  if (total !== 50) problems.push(`Deck má ${total} kariet (treba presne 50).`);
  entries.forEach((e) => {
    if (!e.c) problems.push(`${e.code}: neznáma karta.`);
    else {
      if (e.n > 4 && !unlimited(e.c)) problems.push(`${e.c.name}: viac ako 4 kópie.`);
      if (leader && !e.c.colors.some((x) => leader.colors.includes(x)))
        problems.push(`${e.c.name}: farba nesedí s leaderom.`);
    }
  });

  // ---------- kolekcia
  const missing = entries
    .map((e) => ({ ...e, miss: Math.max(0, e.n - (owned[e.code] ?? 0)) }))
    .filter((e) => e.miss > 0);
  if (leader && !(owned[leader.code] > 0)) missing.unshift({ code: leader.code, n: 1, c: leader, miss: 1 });
  const missCost = missing.reduce((s, e) => s + e.miss * ((e.c?.usd ?? 0) / usd), 0);
  const deckCost = entries.reduce((s, e) => s + e.n * ((e.c?.usd ?? 0) / usd), 0) + (leader?.usd ?? 0) / usd;

  // ---------- krivka
  const curve = Array.from({ length: 11 }, (_, i) =>
    entries.filter((e) => (e.c?.cost ?? -1) === i || (i === 10 && (e.c?.cost ?? 0) > 10)).reduce((s, e) => s + e.n, 0),
  );
  const cmax = Math.max(1, ...curve);

  // ---------- výber kariet
  const pool = data.cards.filter((c) => {
    if (c.v) return false;
    if (!leader) return c.type === "Leader" && (!q || match(c, q)) && (!color || c.colors.includes(color));
    if (c.type === "Leader") return false;
    if (!c.colors.some((x) => leader.colors.includes(x))) return false;
    if (type && c.type !== type) return false;
    if (cost !== "" && (cost === "10" ? (c.cost ?? 0) < 10 : c.cost !== Number(cost))) return false;
    if (color && !c.colors.includes(color)) return false;
    if (onlyOwned && !(owned[c.code] > 0)) return false;
    return !q || match(c, q);
  });
  const poolSorted = [...new Map(pool.map((c) => [c.code, c])).values()].sort(
    (a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.code.localeCompare(b.code),
  );

  const groups = ["Character", "Event", "Stage"].map((t) => ({
    t,
    items: entries.filter((e) => (e.c?.type ?? "Character") === t).sort((a, b) => (a.c?.cost ?? 0) - (b.c?.cost ?? 0)),
  }));

  const exportText = () =>
    [leader ? `1x${leader.code}` : "", ...entries.map((e) => `${e.n}x${e.code}`)].filter(Boolean).join("\n");

  const importText = (s: string) => {
    const cards: Record<string, number> = {};
    let lead: string | null = null;
    for (const line of s.split(/\n/)) {
      const m = line.trim().match(/^(\d+)\s*x?\s*([A-Z]{1,4}\d{0,2}-\d{3})/i);
      if (!m) continue;
      const code = m[2].toUpperCase();
      const c = byCode.get(code);
      if (c?.type === "Leader") lead = code;
      else cards[code] = (cards[code] || 0) + parseInt(m[1]);
    }
    update({ cards, leader_id: lead ?? deck.leader_id });
    setTxt(null);
  };

  const copyToMine = async () => {
    const { data: d, error } = await sb()
      .from("decks")
      .insert({ name: `${deck.name} (kópia)`, leader_id: deck.leader_id, cards: deck.cards, notes: deck.notes })
      .select()
      .single();
    if (error) return alert(error.message);
    router.push(`/decky/${d.id}`);
  };

  const remove = async () => {
    if (!confirm(`Zmazať deck „${deck.name}“?`)) return;
    await sb().from("decks").delete().eq("id", deck.id);
    router.push("/decky");
  };

  return (
    <>
      <div className="head">
        <div className="grow">
          <Link href="/decky" className="small">
            ← Decky
          </Link>
          {editable ? (
            <input className="title-in" value={deck.name} onChange={(e) => update({ name: e.target.value })} />
          ) : (
            <h1>
              {deck.name} <span className="muted small">od {owner}</span>
            </h1>
          )}
          <p className="muted small">{status}</p>
        </div>
        <div className="row gap wrapr">
          <button className="btn ghost sm" onClick={() => setTxt(exportText())}>
            Export / import
          </button>
          {!editable && (
            <button className="btn sm" onClick={copyToMine}>
              Skopírovať do mojich
            </button>
          )}
          {editable && (
            <button className="btn ghost sm danger" onClick={remove}>
              Zmazať
            </button>
          )}
        </div>
      </div>

      <div className="deckgrid">
        <section className="deckside">
          <div className="leader">
            {leader ? (
              <>
                <CardImg card={leader} />
                <div>
                  <div className="small muted">Leader</div>
                  <b>{leader.name}</b>
                  <div className="small">
                    <ColorDots colors={leader.colors} /> {leader.code} · Life {leader.life ?? "?"} ·{" "}
                    {leader.power ?? "?"}
                  </div>
                  {editable && (
                    <button className="link small" onClick={() => update({ leader_id: null })}>
                      zmeniť leadera
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="empty small">Vyber leadera v zozname vpravo →</div>
            )}
          </div>

          <div className={`count ${total === 50 ? "ok" : ""}`}>
            <b>{total}</b>/50
          </div>

          <div className="curve">
            {curve.map((n, i) => (
              <div key={i} title={`cost ${i}${i === 10 ? "+" : ""}: ${n}`}>
                <i style={{ height: `${(n / cmax) * 100}%` }} />
                <span>{i === 10 ? "10+" : i}</span>
              </div>
            ))}
          </div>

          {groups.map(
            (g) =>
              g.items.length > 0 && (
                <div key={g.t}>
                  <h3 className="sub">
                    {TYPE_SK[g.t]} ({g.items.reduce((s, e) => s + e.n, 0)})
                  </h3>
                  <ul className="dlist">
                    {g.items.map((e) => {
                      const have = owned[e.code] ?? 0;
                      return (
                        <li key={e.code}>
                          <span className="cost">{e.c?.cost ?? "?"}</span>
                          <button className="link left" onClick={() => e.c && setOpen(e.c)}>
                            {e.c?.name ?? e.code} <span className="muted tiny">{e.code}</span>
                          </button>
                          <span className={`tiny ${have >= e.n ? "okc" : "badc"}`} title="v mojej kolekcii">
                            {Math.min(have, e.n)}/{e.n}
                          </span>
                          {editable ? (
                            <span className="qty">
                              <button onClick={() => setCount(e.code, e.n - 1)}>−</button>
                              <b>{e.n}</b>
                              <button onClick={() => setCount(e.code, e.n + 1)}>+</button>
                            </span>
                          ) : (
                            <b>×{e.n}</b>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
          )}

          <div className="panel">
            <div>
              Cena decku: <b>{eur(deckCost)}</b>
            </div>
            <div>
              Chýba mi: <b>{missing.reduce((s, e) => s + e.miss, 0)} kariet</b> za <b>{eur(missCost)}</b>
            </div>
            {missing.length > 0 && (
              <details>
                <summary className="small">čo chýba</summary>
                <ul className="small plain">
                  {missing.map((e) => (
                    <li key={e.code}>
                      {e.miss}× {e.c?.name ?? e.code} <span className="muted">{e.code}</span>{" "}
                      {e.c?.usd != null && <span className="muted">· {eur(e.c.usd / usd)}/ks</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {problems.length > 0 ? (
            <ul className="problems small">
              {problems.map((p, i) => (
                <li key={i}>⚠ {p}</li>
              ))}
            </ul>
          ) : (
            <p className="okc small">✓ Deck je legálny</p>
          )}

          <label className="field">
            <span>Poznámky</span>
            <textarea
              rows={3}
              value={deck.notes ?? ""}
              readOnly={!editable}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
        </section>

        <section>
          <div className="filters">
            <label className="field grow">
              <span>{leader ? "Hľadať kartu" : "Hľadať leadera"}</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="meno, kód, typ, text…" />
            </label>
            <label className="field">
              <span>Farba</span>
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="">Všetky</option>
                {(leader ? leader.colors : COLORS).map((c) => (
                  <option key={c} value={c}>
                    {COLOR_SK[c] ?? c}
                  </option>
                ))}
              </select>
            </label>
            {leader && (
              <>
                <label className="field">
                  <span>Typ</span>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="">Všetky</option>
                    <option value="Character">Postava</option>
                    <option value="Event">Event</option>
                    <option value="Stage">Stage</option>
                  </select>
                </label>
                <label className="field">
                  <span>Cost</span>
                  <select value={cost} onChange={(e) => setCost(e.target.value)}>
                    <option value="">Všetky</option>
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 10 ? "10+" : i}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Len
                  čo mám
                </label>
              </>
            )}
          </div>
          <p className="muted small">{poolSorted.length} kariet · klik = pridať, pravý klik / ⓘ = detail</p>
          <div className="cgrid small-cards">
            {poolSorted.slice(0, 240).map((c) => {
              const inDeck = deck.cards?.[c.code] ?? 0;
              return (
                <div
                  key={c.code}
                  className={`ccell pick ${inDeck ? "indeck" : ""}`}
                  onClick={() =>
                    editable && (leader ? setCount(c.code, inDeck + 1) : update({ leader_id: c.code }))
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setOpen(c);
                  }}
                >
                  <CardImg card={c} />
                  {inDeck > 0 && <span className="badge">{inDeck}</span>}
                  <button
                    className="info"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(c);
                    }}
                  >
                    ⓘ
                  </button>
                  <div className="cmeta">
                    <span className="tiny">{c.code}</span>
                    <span className={`tiny ${(owned[c.code] ?? 0) > 0 ? "okc" : "muted"}`}>
                      mám {owned[c.code] ?? 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {open && <CardModal card={open} usd={usd} onClose={() => setOpen(null)} />}
      {txt !== null && (
        <div className="modal" onClick={() => setTxt(null)}>
          <div className="mbox col" onClick={(e) => e.stopPropagation()}>
            <h2>Export / import</h2>
            <p className="small muted">Formát „4xOP01-016“ – funguje s OPTCGSim a väčšinou deckbuilderov.</p>
            <textarea rows={16} value={txt} onChange={(e) => setTxt(e.target.value)} />
            <div className="row gap">
              <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(txt)}>
                Kopírovať
              </button>
              {editable && (
                <button className="btn sm" onClick={() => importText(txt)}>
                  Importovať (prepíše deck)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function match(c: Card, q: string) {
  const s = q.trim().toLowerCase();
  return (
    c.name.toLowerCase().includes(s) ||
    c.code.toLowerCase().includes(s) ||
    c.traits.toLowerCase().includes(s) ||
    c.text.toLowerCase().includes(s)
  );
}
