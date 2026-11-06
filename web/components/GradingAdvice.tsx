"use client";
import { useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/data";
import { cardEur, eur } from "@/lib/data";
import { adviseGrading, Advice, Costs, Grader, GRADER_SK, GRADERS, GradedPrice, loadGraded, VERDICT_ORDER, VERDICT_SK } from "@/lib/grading";

const KEY = "op-grading-costs";
// Poplatok PSA Frankfurt od 49,99 € podľa dostupných zdrojov, spiatočná doprava nie je zverejnená. Každý si to môže prepísať.
const DEFAULTS: Costs = { fee: 55, sellPct: 10 }; // poplatky ostatných firiem sa líšia, pri zmene firmy si ich treba prepísať
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eur(Math.abs(v), 0)}`;

/** Čo zo zbierky sa oplatí dať na grading. Kým ceny nemáme, sekcia sa neukáže. */
export default function GradingAdvice({ cards, usd, onOpen }: { cards: Card[]; usd: number; onOpen: (c: Card) => void }) {
  const [prices, setPrices] = useState<Map<string, GradedPrice[]> | null>(null);
  const [costs, setCosts] = useState<Costs>(DEFAULTS);
  const [grader, setGrader] = useState<Grader>("PSA");
  const ids = useMemo(() => cards.map((c) => c.id).join(","), [cards]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (s && isFinite(s.fee) && isFinite(s.sellPct)) setCosts(s);
    } catch {}
  }, []);
  useEffect(() => {
    let live = true;
    loadGraded(ids ? ids.split(",") : []).then((m) => live && setPrices(m));
    return () => {
      live = false;
    };
  }, [ids]);

  const list = useMemo(() => {
    if (!prices) return [];
    const out: { card: Card; a: Advice }[] = [];
    for (const card of cards) {
      const raw = cardEur(card, usd);
      const a = raw != null ? adviseGrading(raw, prices.get(card.id), usd, costs, grader) : null;
      if (a) out.push({ card, a });
    }
    return out.sort((x, y) => VERDICT_ORDER.indexOf(x.a.verdict) - VERDICT_ORDER.indexOf(y.a.verdict) || y.a.gainTop - x.a.gainTop);
  }, [prices, cards, usd, costs, grader]);

  if (!prices || prices.size === 0) return null;
  const set = (k: keyof Costs, v: string) => {
    const n = Math.max(0, Number(v.replace(",", ".")) || 0);
    const next = { ...costs, [k]: n };
    setCosts(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <section className="panel collector grading">
      <h2 className="sub">Čo dať na grading</h2>
      <p className="small muted">Podľa skutočných predajov na eBay v dolároch, prepočítané na eurá. Stav svojej karty poznáš len ty, preto je pri každej uvedené, akú šancu na najvyššiu známku musí mať, aby sa to vyplatilo. Horšie známky nerátame, pri nich býva strata väčšia.</p>
      <div className="grading-costs">
        <label className="field">
          <span>Firma</span>
          <select value={grader} onChange={(e) => setGrader(e.target.value as Grader)}>
            {(Object.keys(GRADERS) as Grader[]).map((g) => (
              <option key={g} value={g}>
                {GRADER_SK[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Grading s dopravou €</span>
          <input type="number" min={0} value={costs.fee} onChange={(e) => set("fee", e.target.value)} />
        </label>
        <label className="field">
          <span>Náklady pri predaji %</span>
          <input type="number" min={0} max={50} value={costs.sellPct} onChange={(e) => set("sellPct", e.target.value)} />
        </label>
      </div>
      {list.length === 0 && <p className="small muted">Pre karty z tvojej zbierky zatiaľ nemáme predaje {GRADER_SK[grader]}.</p>}
      {list.slice(0, 15).map(({ card, a }) => (
        <button key={card.id} className="grading-row" onClick={() => onOpen(card)}>
          <span className="grading-name">
            <b>{card.name}</b> <span className="muted tiny">{card.id}</span>
            <small className={`grading-v ${a.verdict}`}>{VERDICT_SK[a.verdict]}</small>
          </span>
          <span className="grading-nums">
            <span>
              Pri {a.grader} {a.top} ({eur(a.vTop, 0)}, {a.salesTop}×)
              <b className={a.gainTop > 0 ? "up" : "down"}>{signed(a.gainTop)}</b>
            </span>
            <span>
              {a.vNext != null ? `Pri ${a.grader} ${a.next} (${eur(a.vNext, 0)})` : "Pri nižšej známke"}
              <b className={a.gainNext > 0 ? "up" : "down"}>{signed(a.gainNext)}</b>
            </span>
          </span>
          {a.needed != null && a.needed > 0 && a.verdict !== "unknown" && <span className="tiny muted">Vyplatí sa pri šanci na {a.grader} {a.top} aspoň {Math.ceil(a.needed * 100)} %.</span>}
        </button>
      ))}
      <p className="tiny muted">Orientačný výpočet, nie finančná rada. Ceny sa môžu rýchlo zmeniť a predaje sú najmä z USA.</p>
    </section>
  );
}
