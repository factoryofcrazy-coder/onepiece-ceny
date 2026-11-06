"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CardImg, CardModal, DataError, FilterBar, Foil, Loading } from "@/components/ui";
import MarketTabs from "@/components/MarketTabs";
import { useAuth } from "@/lib/auth";
import { topMoves } from "@/lib/collector";
import { useCollection } from "@/lib/collection";
import { Card, eur, sortSets, useCards, usePrices } from "@/lib/data";
import { formatPct, salesChange } from "@/lib/price-series";
import { useTcg } from "@/lib/tcg";
import { useLang } from "@/lib/lang";
import { VARIANT_GROUPS, variantGroup, type VariantGroup } from "@/lib/variants";

const PER = 20;
const MIN_PRICES = [1, 5, 20, 100];

export default function Page() {
  const { tcg } = useTcg();
  const { t } = useLang();
  if (tcg === "pokemon")
    return (
      <div className="empty">
        {t("Pohyby cien máme zatiaľ len pre One Piece.", "Price moves are only available for One Piece so far.")} <Link href="/karty">{t("Späť na karty", "Back to cards")}</Link>
      </div>
    );
  return <Moves />;
}

function Moves() {
  const { t, lang } = useLang();
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const usd = prices?.fx?.USD ?? 1.12;
  const { user } = useAuth();
  const { qty, setQty } = useCollection(user?.id, !!user);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [min, setMin] = useState(5);
  const [set, setSet] = useState("");
  const [group, setGroup] = useState<VariantGroup | "">("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Card | null>(null);

  const sets = useMemo(() => (data ? sortSets(data.sets) : []), [data]);
  const moves = useMemo(() => (data ? topMoves(set ? data.cards.filter((c) => c.set === set) : data.cards, usd, dir, min) : []), [data, usd, dir, min, set]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of moves) c[variantGroup(m.card.v)] = (c[variantGroup(m.card.v)] ?? 0) + 1;
    return c;
  }, [moves]);
  const list = useMemo(() => (group ? moves.filter((m) => variantGroup(m.card.v) === group) : moves), [moves, group]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const cur = Math.min(page, pages - 1);
  const reset = () => setPage(0);

  if (error) return <DataError error={error} file="cards" />;
  if (!data) return <Loading shape="rows" />;

  return (
    <div className="moves">
      <MarketTabs />
      <h1>{t("Pohyby cien", "Price moves")}</h1>
      <p className="muted moves-note">
        {t("Priemerná predajná cena za posledných 7 dní oproti 30 dňom podľa Cardmarketu. Je to orientačné: kariet sa často predá málo a jeden predaj dokáže priemer pohnúť, preto sa oplatí pozrieť si aj ponuky.", "Average selling price over the last 7 days vs 30 days on Cardmarket. Treat it as a guide: few copies of a card often sell and a single sale can move the average, so it's worth checking the offers too.")}
      </p>
      <div className="pchart-range moves-dir" role="group" aria-label={t("Smer pohybu", "Direction")}>
        <button className={dir === "up" ? "on" : ""} aria-pressed={dir === "up"} onClick={() => (setDir("up"), reset())}>
          {t("Zdražujú", "Rising")}
        </button>
        <button className={dir === "down" ? "on" : ""} aria-pressed={dir === "down"} onClick={() => (setDir("down"), reset())}>
          {t("Zlacňujú", "Falling")}
        </button>
      </div>
      <FilterBar>
        <label className="field">
          <span>{t("Cena od", "Price from")}</span>
          <select value={min} onChange={(e) => (setMin(Number(e.target.value)), reset())}>
            {MIN_PRICES.map((m) => (
              <option key={m} value={m}>
                {m} €
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Set</span>
          <select value={set} onChange={(e) => (setSet(e.target.value), reset())}>
            <option value="">{t("Všetky", "All")}</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <div className="vgroups" role="group" aria-label={t("Verzia karty", "Card version")}>
        <button className={group === "" ? "on" : ""} aria-pressed={group === ""} onClick={() => (setGroup(""), reset())}>
          {t("Všetky", "All")} <i>{moves.length}</i>
        </button>
        {VARIANT_GROUPS.map((g) => (
          <button key={g.id} className={`g-${g.id}${group === g.id ? " on" : ""}`} aria-pressed={group === g.id} disabled={!counts[g.id]} onClick={() => (setGroup(g.id), reset())}>
            {lang === "en" ? g.en : g.label} <i>{counts[g.id] ?? 0}</i>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">{t("Pre tento výber nemáme žiadne pohyby. Skús nižšiu cenu, iný set alebo inú verziu.", "No moves for this selection. Try a lower price, another set or another version.")}</div>
      ) : (
        <div className="vlist mv-list">
          {list.slice(cur * PER, cur * PER + PER).map((m, k) => {
            const s = salesChange(m.card)!;
            const g = variantGroup(m.card.v);
            return (
              <div key={m.card.id} className="vrow mv-row" role="button" tabIndex={0} onClick={() => setOpen(m.card)} onKeyDown={(e) => e.key === "Enter" && setOpen(m.card)}>
                <span className="vrank">{cur * PER + k + 1}</span>
                <Foil holo={!!m.card.v} className="vthumb">
                  <CardImg card={m.card} />
                </Foil>
                <span className="vname">
                  <b>{m.card.name}</b>
                  <span className="mv-meta">
                    <span className="muted">{m.card.code}</span>
                    {m.card.v && <span className={`vtag g-${g}`}>{m.card.v}</span>}
                  </span>
                </span>
                <span className={`mv-pct ${m.pct > 0 ? "up" : "down"}`}>{formatPct(m.pct)}</span>
                <span className="mv-avg">
                  <span>
                    <i>{t("30 dní", "30 days")}</i> {eur(s.avg30)}
                  </span>
                  <span className="mv-arrow" aria-hidden>
                    →
                  </span>
                  <span>
                    <i>{t("7 dní", "7 days")}</i> <b>{eur(s.avg7)}</b>
                  </span>
                </span>
                <span className="mv-now">
                  <i>trend</i>
                  <b className="vtotal">{eur(m.price)}</b>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {pages > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={cur === 0} onClick={() => (setPage(cur - 1), scrollTo({ top: 0 }))}>
            ← {t("Späť", "Back")}
          </button>
          <span className="small muted">
            {t(`Strana ${cur + 1} z ${pages} · ${list.length} kariet`, `Page ${cur + 1} of ${pages} · ${list.length} cards`)}
          </span>
          <button className="btn ghost sm" disabled={cur >= pages - 1} onClick={() => (setPage(cur + 1), scrollTo({ top: 0 }))}>
            {t("Ďalej", "Next")} →
          </button>
        </div>
      )}
      {open && <CardModal card={open} usd={usd} onClose={() => setOpen(null)} qty={user ? qty[open.id] ?? 0 : undefined} onSet={user ? (v) => setQty(open.id, v) : undefined} />}
    </div>
  );
}
