"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardImg, CardModal, DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { Card, cardEur, eur, useCards, usePrices } from "@/lib/data";
import { addListing, Listing, removeListing, TradeKind, updateListing, useMyContact, useTrades } from "@/lib/trades";
import { useTcg } from "@/lib/tcg";

type Tab = "offer" | "want" | "mine";
const TAB_SK: Record<Tab, string> = { offer: "Ponuky", want: "Hľadané", mine: "Moje" };
const COND: Listing["cond"][] = ["NM", "LP", "MP", "HP", "DMG"];

function ago(ts: string) {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `pred ${Math.max(m, 1)} min`;
  if (m < 48 * 60) return `pred ${Math.round(m / 60)} h`;
  return `pred ${Math.round(m / 1440)} d`;
}

export default function TradePage() {
  const { tcg } = useTcg();
  const { user, loading } = useAuth();
  const { data: cards, error } = useCards();
  const { data: prices } = usePrices();
  const usd = prices?.fx?.USD ?? 1.12;
  const { list, traders, missing, loading: tLoading, reload, error: tError } = useTrades(!loading, !!user);
  const uid = user?.id;
  const { qty } = useCollection(user?.id ?? null, false);
  const me = useMyContact(user?.id);
  const [tab, setTab] = useState<Tab>("offer");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Card | null>(null);
  const [msg, setMsg] = useState("");
  const [addQ, setAddQ] = useState("");
  const [view, setViewState] = useState<"grid" | "list">("grid");
  const [fSet, setFSet] = useState("");
  const [fLang, setFLang] = useState("");
  const [fCond, setFCond] = useState("");
  const [fDeal, setFDeal] = useState<"" | "sale" | "swap">("");
  const [sort, setSort] = useState<"new" | "cheap" | "dear" | "deal">("new");
  const [copied, setCopied] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("trade-view") === "list") setViewState("list");
  }, []);
  const setView = (v: "grid" | "list") => {
    setViewState(v);
    localStorage.setItem("trade-view", v);
  };

  const mineWant = useMemo(() => new Set(list.filter((l) => l.user_id === uid && l.kind === "want").map((l) => l.card_id)), [list, user]);
  const mineOffer = useMemo(() => new Set(list.filter((l) => l.user_id === uid && l.kind === "offer").map((l) => l.card_id)), [list, user]);

  if (tcg === "pokemon")
    return (
      <div className="tr-page">
        <h1>Trhovisko</h1>
        <p className="muted">Trhovisko je zatiaľ pre One Piece karty – prepni hore na One Piece.</p>
      </div>
    );
  if (loading) return <Loading shape="rows" />;
  if (error) return <DataError error={error} file="cards" />;
  if (!cards) return <Loading what="Načítavam karty" shape="rows" />;

  const card = (id: string) => cards.byId.get(id);
  const s = q.trim().toLowerCase();
  const match = (l: Listing) => {
    if (!s) return true;
    const c = card(l.card_id);
    const t = traders.get(l.user_id);
    return [c?.name, c?.code, l.card_id, t?.username].some((x) => x?.toLowerCase().includes(s));
  };
  // zhoda: niekto ponúka, čo hľadám / hľadá, čo mám (v zbierke alebo v ponuke)
  const isMatch = (l: Listing) =>
    !!uid && l.user_id !== uid && (l.kind === "offer" ? mineWant.has(l.card_id) : (qty[l.card_id] ?? 0) > 0 || mineOffer.has(l.card_id));
  const cmOf = (l: Listing) => {
    const c = card(l.card_id);
    return c ? cardEur(c, usd, l.lang) : null;
  };
  const discount = (l: Listing) => {
    const cm = cmOf(l);
    return l.price != null && cm ? (l.price / cm - 1) * 100 : null;
  };
  const passes = (l: Listing) =>
    (!fSet || card(l.card_id)?.set === fSet) &&
    (!fLang || l.lang === fLang) &&
    (!fCond || l.cond === fCond) &&
    (!fDeal || (fDeal === "sale" ? l.price != null : l.price == null));
  const others = list.filter((l) => l.user_id !== uid);
  const orderBy = (a: Listing, b: Listing) => {
    if (sort === "cheap") return (a.price ?? 1e9) - (b.price ?? 1e9);
    if (sort === "dear") return (b.price ?? -1) - (a.price ?? -1);
    if (sort === "deal") return (discount(a) ?? 1e9) - (discount(b) ?? 1e9);
    return b.created_at.localeCompare(a.created_at);
  };
  const shown = list
    .filter((l) => (tab === "mine" ? l.user_id === uid : l.kind === tab && l.user_id !== uid))
    .filter(match)
    .filter((l) => tab === "mine" || passes(l))
    .sort(orderBy);
  const forYou = others.filter(isMatch).slice(0, 10);
  const setsHere = [...new Map(others.map((l) => card(l.card_id)).filter(Boolean).map((c) => [c!.set, c!.setName])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const filtersOn = !!(fSet || fLang || fCond || fDeal || s);
  const resetFilters = () => {
    setFSet("");
    setFLang("");
    setFCond("");
    setFDeal("");
    setQ("");
  };
  const copyContact = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* bez schránky aspoň ukážeme text */
    }
    setCopied(id);
    setTimeout(() => setCopied(""), 1800);
  };
  const matches = list.filter(isMatch).length;

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };
  const add = async (c: Card, kind: TradeKind) => {
    const err = await addListing({ card_id: c.id, kind });
    flash(err ?? `${c.name} – ${kind === "offer" ? "pridané do ponuky" : "pridané do hľadaných"}`);
    if (!err) reload();
  };
  const found =
    addQ.trim().length >= 2
      ? cards.cards.filter((c) => [c.name, c.id].some((x) => x.toLowerCase().includes(addQ.trim().toLowerCase()))).slice(0, 10)
      : [];

  const sellerLine = (l: Listing) => {
    const t = traders.get(l.user_id);
    return (
      <div className="trx-seller">
        <span className="sb-av trx-av" aria-hidden>
          {(t?.username ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="trx-sname">
          <b>{t?.username ?? "hráč"}</b>
          <i>{ago(l.created_at)}</i>
        </span>
        {!user ? (
          <Link className="btn ghost sm trx-contact" href="/login" title="Kontakt vidia prihlásení">
            Kontakt
          </Link>
        ) : t?.contact ? (
          <button className="btn ghost sm trx-contact" title={t.contact} onClick={() => copyContact(l.id, t.contact!)}>
            {copied === l.id ? "Skopírované" : "Kontakt"}
          </button>
        ) : (
          <span className="tiny muted">bez kontaktu</span>
        )}
      </div>
    );
  };
  const priceBlock = (l: Listing) => {
    const d = discount(l);
    const cm = cmOf(l);
    return (
      <div className="trx-price">
        <strong>{l.kind === "want" ? (l.price != null ? `do ${eur(l.price)}` : "Hľadá") : l.price != null ? eur(l.price) : "Na výmenu"}</strong>
        {d != null && l.kind === "offer" && <span className={d < 0 ? "trx-good" : "trx-over"}>{d > 0 ? "+" : ""}{Math.round(d)} %</span>}
        {cm != null && <i>Cardmarket {eur(cm)}</i>}
      </div>
    );
  };

  return (
    <div className="tr-page trx">
      <div className="trx-head">
        <div>
          <h1>Trhovisko</h1>
          <p className="muted">Ponúkni karty na predaj alebo výmenu a nájdi tie, ktoré ti chýbajú. Dohodnete sa medzi sebou cez kontakt.</p>
        </div>
        {user ? (
          <button className="btn" onClick={() => setTab("mine")}>
            Pridať ponuku
          </button>
        ) : (
          <Link className="btn" href="/login">
            Prihlásiť sa a pridať ponuku
          </Link>
        )}
      </div>

      {missing && <div className="empty warn">Trhovisko sa práve pripravuje – databáza ešte nemá tabuľku ponúk. Skús to o chvíľu.</div>}
      {!missing && tError && <div className="empty warn">{tError}</div>}

      {forYou.length > 0 && (
        <section className="trx-foryou" aria-label="Zhody pre teba">
          <div className="trx-fhead">
            <h2>Pre teba</h2>
            <span className="tiny">
              {matches} {matches === 1 ? "zhoda" : matches < 5 ? "zhody" : "zhôd"} so zbierkou a hľadanými kartami
            </span>
          </div>
          <div className="trx-strip">
            {forYou.map((l) => {
              const c = card(l.card_id);
              return (
                <button key={l.id} className="trx-mini" onClick={() => c && setOpen(c)}>
                  {c ? <CardImg card={c} /> : <span className="cimg ph">{l.card_id}</span>}
                  <b>{c?.name ?? l.card_id}</b>
                  <span className="tiny">
                    {l.kind === "offer" ? "Ponúka" : "Hľadá"} {traders.get(l.user_id)?.username ?? "hráč"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="trx-bar">
        <div className="rep-kinds" role="tablist" aria-label="Zobrazenie">
          {(Object.keys(TAB_SK) as Tab[]).filter((t) => user || t !== "mine").map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {TAB_SK[t]} ({t === "mine" ? list.filter((l) => l.user_id === uid).length : others.filter((l) => l.kind === t).length})
            </button>
          ))}
        </div>
        {tab !== "mine" && (
          <div className="seg" role="radiogroup" aria-label="Rozloženie">
            <button role="radio" aria-checked={view === "grid"} className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
              Mriežka
            </button>
            <button role="radio" aria-checked={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
              Zoznam
            </button>
          </div>
        )}
      </div>

      {tab === "mine" && (
        <section className="tr-mine ucet-card">
          <label className="tr-contact">
            <span>Tvoj kontakt (Discord, Instagram, Messenger…), uvidia ho ostatní pri tvojich ponukách</span>
            <div className="row gap">
              <input value={me.contact} onChange={(e) => me.setContact(e.target.value)} placeholder="napr. Discord: Anon" maxLength={120} />
              <button className="btn sm" onClick={async () => flash((await me.save(me.contact)) ?? "Kontakt uložený")}>
                Uložiť
              </button>
            </div>
          </label>
          <div className="tr-add">
            <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Pridať kartu: meno alebo kód, napríklad OP05-119" />
            {found.length > 0 && (
              <ul>
                {found.map((c) => (
                  <li key={c.id}>
                    <CardImg card={c} />
                    <span className="grow">
                      <b>{c.name}</b> <span className="small muted">{c.id}{c.v ? ` · ${c.v}` : ""} · {eur(cardEur(c, usd))}</span>
                    </span>
                    <button className="btn sm" onClick={() => add(c, "offer")}>
                      Ponúkam
                    </button>
                    <button className="btn ghost sm" onClick={() => add(c, "want")}>
                      Hľadám
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab !== "mine" && (
        <div className={`trx-filters ${showFilters ? "open" : ""}`}>
          <input className="trx-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať kartu alebo hráča" aria-label="Hľadať kartu alebo hráča" />
          <button type="button" className="btn ghost trx-ftoggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? "Menej" : "Filtre"}
          </button>
          <select value={fSet} onChange={(e) => setFSet(e.target.value)} aria-label="Set">
            <option value="">Všetky sety</option>
            {setsHere.map(([id, name]) => (
              <option key={id} value={id}>
                {id === "CM-PROMO" ? "Promo" : id} {name && id !== "CM-PROMO" ? `– ${name}` : ""}
              </option>
            ))}
          </select>
          <select value={fLang} onChange={(e) => setFLang(e.target.value)} aria-label="Jazyk">
            <option value="">EN aj JP</option>
            <option>EN</option>
            <option>JP</option>
          </select>
          <select value={fCond} onChange={(e) => setFCond(e.target.value)} aria-label="Stav karty">
            <option value="">Každý stav</option>
            {COND.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {tab === "offer" && (
            <select value={fDeal} onChange={(e) => setFDeal(e.target.value as any)} aria-label="Predaj alebo výmena">
              <option value="">Predaj aj výmena</option>
              <option value="sale">Len predaj</option>
              <option value="swap">Len výmena</option>
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Zoradiť">
            <option value="new">Najnovšie</option>
            <option value="cheap">Najlacnejšie</option>
            <option value="dear">Najdrahšie</option>
            {tab === "offer" && <option value="deal">Najlepšie oproti Cardmarketu</option>}
          </select>
        </div>
      )}

      {msg && <div className="tr-msg">{msg}</div>}

      {tLoading ? (
        <Loading shape="rows" />
      ) : shown.length === 0 ? (
        <div className="empty">
          {tab === "mine" ? (
            "Zatiaľ nič neponúkaš ani nehľadáš. Pridaj kartu vyššie alebo v detaile karty."
          ) : filtersOn ? (
            <>
              Tomuto výberu nič nezodpovedá.{" "}
              <button className="link" onClick={resetFilters}>
                Zrušiť filtre
              </button>
            </>
          ) : (
            user ? "Zatiaľ tu nič nie je. Buď prvý a pridaj svoju ponuku." : "Zatiaľ tu nič nie je."
          )}
        </div>
      ) : tab !== "mine" && view === "grid" ? (
        <div className="trx-grid">
          {shown.map((l) => {
            const c = card(l.card_id);
            return (
              <article key={l.id} className={`trx-card ${isMatch(l) ? "match" : ""}`}>
                <button className="trx-img" onClick={() => c && setOpen(c)} aria-label={`Detail karty ${c?.name ?? l.card_id}`}>
                  {c ? <CardImg card={c} /> : <span className="cimg ph">{l.card_id}</span>}
                  {isMatch(l) && <span className="trx-flag">Zhoda</span>}
                </button>
                <div className="trx-body">
                  <b className="trx-name">{c?.name ?? l.card_id}</b>
                  <span className="tiny muted">
                    {l.card_id.split("_")[0]}
                    {c?.v ? ` · ${c.v}` : ""}
                  </span>
                  <div className="trx-tags">
                    <span className="tag dim">{l.cond}</span>
                    <span className="tag dim">{l.lang}</span>
                    {l.qty > 1 && <span className="tag dim">{l.qty}×</span>}
                  </div>
                  {priceBlock(l)}
                  {l.note && <p className="trx-note">„{l.note}“</p>}
                  {sellerLine(l)}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <ul className="tr-list trx-list">
          {shown.map((l) => {
            const c = card(l.card_id);
            const mine = l.user_id === uid;
            return (
              <li key={l.id} className={isMatch(l) ? "match" : ""}>
                <button className="tr-img" onClick={() => c && setOpen(c)} aria-label="Detail karty">
                  {c ? <CardImg card={c} /> : <span className="cimg ph">{l.card_id}</span>}
                </button>
                <div className="tr-body">
                  <div className="row between gap">
                    <b className="tr-name">{c?.name ?? l.card_id}</b>
                    {isMatch(l) && <span className="chip hot">Zhoda</span>}
                    {mine && <span className="tag dim">{l.kind === "offer" ? "Ponúkam" : "Hľadám"}</span>}
                  </div>
                  <span className="small muted">
                    {l.card_id.split("_")[0]}
                    {c?.v ? ` · ${c.v}` : ""} · {l.qty}× · {l.cond} · {l.lang}
                  </span>
                  {priceBlock(l)}
                  {l.note && !mine && <span className="small tr-note">„{l.note}“</span>}
                  {mine ? (
                    <div className="tr-edit">
                      <select value={l.cond} onChange={async (e) => (await updateListing(l.id, { cond: e.target.value as any }), reload())} aria-label="Stav">
                        {COND.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      <select value={l.lang} onChange={async (e) => (await updateListing(l.id, { lang: e.target.value as any }), reload())} aria-label="Jazyk">
                        <option>EN</option>
                        <option>JP</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        defaultValue={l.price ?? ""}
                        placeholder="cena €"
                        onBlur={async (e) => (await updateListing(l.id, { price: e.target.value === "" ? null : Number(e.target.value) }), reload())}
                        aria-label="Cena v €"
                      />
                      <input
                        defaultValue={l.note ?? ""}
                        placeholder="poznámka"
                        maxLength={300}
                        onBlur={async (e) => (await updateListing(l.id, { note: e.target.value || null }), reload())}
                        aria-label="Poznámka"
                      />
                      <button className="btn ghost sm danger" onClick={async () => (await removeListing(l.id), reload())}>
                        Zrušiť
                      </button>
                    </div>
                  ) : (
                    sellerLine(l)
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && <CardModal card={open} usd={usd} onClose={() => setOpen(null)} />}
      <p className="tiny muted" style={{ marginTop: 24 }}>
        Grand Line Tracker len spája ľudí, výmenu či predaj si dohodnete sami. {user && <><Link href="/zbierka">Tvoja zbierka</Link> je súkromná.</>}
      </p>
    </div>
  );
}
