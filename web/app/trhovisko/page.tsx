"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardImg, CardModal, DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { WriteLink } from "@/components/dm/DmLink";
import { DM_ENABLED } from "@/lib/config";
import { useCollection } from "@/lib/collection";
import { Card, cardEur, eur, useCards, usePrices } from "@/lib/data";
import { addListing, Listing, removeListing, TradeKind, updateListing, useMyContact, useTrades } from "@/lib/trades";
import { useTcg } from "@/lib/tcg";
import { useLang } from "@/lib/lang";

type Tab = "offer" | "want" | "mine";
const TAB_SK: Record<Tab, string> = { offer: "Ponuky", want: "Hľadané", mine: "Moje" };
const TAB_EN: Record<Tab, string> = { offer: "Offers", want: "Wanted", mine: "Mine" };
const COND: Listing["cond"][] = ["NM", "LP", "MP", "HP", "DMG"];

function ago(ts: string, en = false) {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return en ? `${Math.max(m, 1)} min ago` : `pred ${Math.max(m, 1)} min`;
  if (m < 48 * 60) return en ? `${Math.round(m / 60)} h ago` : `pred ${Math.round(m / 60)} h`;
  return en ? `${Math.round(m / 1440)} d ago` : `pred ${Math.round(m / 1440)} d`;
}

export default function TradePage() {
  const { tcg } = useTcg();
  const { t: L, lang } = useLang();
  const en = lang === "en";
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
        <h1>{L("Trhovisko", "Marketplace")}</h1>
        <p className="muted">{L("Trhovisko je zatiaľ pre One Piece karty – prepni hore na One Piece.", "The marketplace is only for One Piece cards so far – switch to One Piece at the top.")}</p>
      </div>
    );
  if (loading) return <Loading shape="rows" />;
  if (error) return <DataError error={error} file="cards" />;
  if (!cards) return <Loading what={L("Načítavam karty", "Loading cards")} shape="rows" />;

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
    flash(err ?? `${c.name} – ${kind === "offer" ? L("pridané do ponuky", "added to offers") : L("pridané do hľadaných", "added to wanted")}`);
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
          <b>{t?.username ?? L("hráč", "player")}</b>
          <i>{ago(l.created_at, en)}</i>
        </span>
        {!user ? (
          <Link className="btn ghost sm trx-contact" href="/login" title={L("Kontakt vidia prihlásení", "Signed-in users see the contact")}>
            {L("Kontakt", "Contact")}
          </Link>
        ) : DM_ENABLED ? (
          <WriteLink className="btn ghost sm trx-contact" userId={l.user_id} listing={l.id} card={l.card_id} />
        ) : t?.contact ? (
          <button className="btn ghost sm trx-contact" title={t.contact} onClick={() => copyContact(l.id, t.contact!)}>
            {copied === l.id ? L("Skopírované", "Copied") : L("Kontakt", "Contact")}
          </button>
        ) : (
          <span className="tiny muted">{L("bez kontaktu", "no contact")}</span>
        )}
      </div>
    );
  };
  const priceBlock = (l: Listing) => {
    const d = discount(l);
    const cm = cmOf(l);
    return (
      <div className="trx-price">
        <strong>{l.kind === "want" ? (l.price != null ? `${L("do", "up to")} ${eur(l.price)}` : L("Hľadá", "Wanted")) : l.price != null ? eur(l.price) : L("Na výmenu", "For trade")}</strong>
        {d != null && l.kind === "offer" && <span className={d < 0 ? "trx-good" : "trx-over"}>{d > 0 ? "+" : ""}{Math.round(d)} %</span>}
        {cm != null && <i>Cardmarket {eur(cm)}</i>}
      </div>
    );
  };

  return (
    <div className="tr-page trx">
      <div className="trx-head">
        <div>
          <h1>{L("Trhovisko", "Marketplace")}</h1>
          <p className="muted">{L("Ponúkni karty na predaj alebo výmenu a nájdi tie, ktoré ti chýbajú. Dohodnete sa medzi sebou cez kontakt.", "Offer cards for sale or trade and find the ones you're missing. You arrange the deal yourselves via contact.")}</p>
        </div>
        {user ? (
          <button className="btn" onClick={() => setTab("mine")}>
            {L("Pridať ponuku", "Add listing")}
          </button>
        ) : (
          <Link className="btn" href="/login">
            {L("Prihlásiť sa a pridať ponuku", "Sign in to add a listing")}
          </Link>
        )}
      </div>

      {missing && <div className="empty warn">{L("Trhovisko sa práve pripravuje – databáza ešte nemá tabuľku ponúk. Skús to o chvíľu.", "The marketplace is being set up – the database doesn't have the listings table yet. Try again in a moment.")}</div>}
      {!missing && tError && <div className="empty warn">{tError}</div>}

      {forYou.length > 0 && (
        <section className="trx-foryou" aria-label={L("Zhody pre teba", "Matches for you")}>
          <div className="trx-fhead">
            <h2>{L("Pre teba", "For you")}</h2>
            <span className="tiny">
              {matches} {L(matches === 1 ? "zhoda" : matches < 5 ? "zhody" : "zhôd", matches === 1 ? "match" : "matches")} {L("so zbierkou a hľadanými kartami", "with your collection and wanted cards")}
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
                    {l.kind === "offer" ? L("Ponúka", "Offered by") : L("Hľadá", "Wanted by")} {traders.get(l.user_id)?.username ?? L("hráč", "player")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="trx-bar">
        <div className="rep-kinds" role="tablist" aria-label={L("Zobrazenie", "View")}>
          {(Object.keys(TAB_SK) as Tab[]).filter((t) => user || t !== "mine").map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {(en ? TAB_EN : TAB_SK)[t]} ({t === "mine" ? list.filter((l) => l.user_id === uid).length : others.filter((l) => l.kind === t).length})
            </button>
          ))}
        </div>
        {tab !== "mine" && (
          <div className="seg" role="radiogroup" aria-label={L("Rozloženie", "Layout")}>
            <button role="radio" aria-checked={view === "grid"} className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
              {L("Mriežka", "Grid")}
            </button>
            <button role="radio" aria-checked={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
              {L("Zoznam", "List")}
            </button>
          </div>
        )}
      </div>

      {tab === "mine" && (
        <section className="tr-mine ucet-card">
          <label className="tr-contact">
            <span>{L("Tvoj kontakt (Discord, Instagram, Messenger…), uvidia ho ostatní pri tvojich ponukách", "Your contact (Discord, Instagram, Messenger…), others see it on your listings")}</span>
            <div className="row gap">
              <input value={me.contact} onChange={(e) => me.setContact(e.target.value)} placeholder={L("napr. Discord: Anon", "e.g. Discord: Anon")} maxLength={120} />
              <button className="btn sm" onClick={async () => flash((await me.save(me.contact)) ?? L("Kontakt uložený", "Contact saved"))}>
                {L("Uložiť", "Save")}
              </button>
            </div>
          </label>
          <div className="tr-add">
            <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder={L("Pridať kartu: meno alebo kód, napríklad OP05-119", "Add a card: name or code, e.g. OP05-119")} />
            {found.length > 0 && (
              <ul>
                {found.map((c) => (
                  <li key={c.id}>
                    <CardImg card={c} />
                    <span className="grow">
                      <b>{c.name}</b> <span className="small muted">{c.code}{c.v ? ` · ${c.v}` : ""} · {eur(cardEur(c, usd))}</span>
                    </span>
                    <button className="btn sm" onClick={() => add(c, "offer")}>
                      {L("Ponúkam", "Offer")}
                    </button>
                    <button className="btn ghost sm" onClick={() => add(c, "want")}>
                      {L("Hľadám", "Want")}
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
          <input className="trx-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Hľadať kartu alebo hráča", "Search card or player")} aria-label={L("Hľadať kartu alebo hráča", "Search card or player")} />
          <button type="button" className="btn ghost trx-ftoggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? L("Menej", "Less") : L("Filtre", "Filters")}
          </button>
          <select value={fSet} onChange={(e) => setFSet(e.target.value)} aria-label="Set">
            <option value="">{L("Všetky sety", "All sets")}</option>
            {setsHere.map(([id, name]) => (
              <option key={id} value={id}>
                {id === "CM-PROMO" ? "Promo" : id} {name && id !== "CM-PROMO" ? `– ${name}` : ""}
              </option>
            ))}
          </select>
          <select value={fLang} onChange={(e) => setFLang(e.target.value)} aria-label={L("Jazyk", "Language")}>
            <option value="">{L("EN aj JP", "EN and JP")}</option>
            <option>EN</option>
            <option>JP</option>
          </select>
          <select value={fCond} onChange={(e) => setFCond(e.target.value)} aria-label={L("Stav karty", "Card condition")}>
            <option value="">{L("Každý stav", "Any condition")}</option>
            {COND.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {tab === "offer" && (
            <select value={fDeal} onChange={(e) => setFDeal(e.target.value as any)} aria-label={L("Predaj alebo výmena", "Sale or trade")}>
              <option value="">{L("Predaj aj výmena", "Sale and trade")}</option>
              <option value="sale">{L("Len predaj", "Sale only")}</option>
              <option value="swap">{L("Len výmena", "Trade only")}</option>
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label={L("Zoradiť", "Sort")}>
            <option value="new">{L("Najnovšie", "Newest")}</option>
            <option value="cheap">{L("Najlacnejšie", "Cheapest")}</option>
            <option value="dear">{L("Najdrahšie", "Most expensive")}</option>
            {tab === "offer" && <option value="deal">{L("Najlepšie oproti Cardmarketu", "Best vs Cardmarket")}</option>}
          </select>
        </div>
      )}

      {msg && <div className="tr-msg">{msg}</div>}

      {tLoading ? (
        <Loading shape="rows" />
      ) : shown.length === 0 ? (
        <div className="empty">
          {tab === "mine" ? (
            L("Zatiaľ nič neponúkaš ani nehľadáš. Pridaj kartu vyššie alebo v detaile karty.", "You're not offering or looking for anything yet. Add a card above or in the card detail.")
          ) : filtersOn ? (
            <>
              {L("Tomuto výberu nič nezodpovedá.", "Nothing matches this selection.")}{" "}
              <button className="link" onClick={resetFilters}>
                {L("Zrušiť filtre", "Clear filters")}
              </button>
            </>
          ) : (
            user ? L("Zatiaľ tu nič nie je. Buď prvý a pridaj svoju ponuku.", "Nothing here yet. Be the first to add a listing.") : L("Zatiaľ tu nič nie je.", "Nothing here yet.")
          )}
        </div>
      ) : tab !== "mine" && view === "grid" ? (
        <div className="trx-grid">
          {shown.map((l) => {
            const c = card(l.card_id);
            return (
              <article key={l.id} className={`trx-card ${isMatch(l) ? "match" : ""}`}>
                <button className="trx-img" onClick={() => c && setOpen(c)} aria-label={`${L("Detail karty", "Card detail")} ${c?.name ?? l.card_id}`}>
                  {c ? <CardImg card={c} /> : <span className="cimg ph">{l.card_id}</span>}
                  {isMatch(l) && <span className="trx-flag">{L("Zhoda", "Match")}</span>}
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
                <button className="tr-img" onClick={() => c && setOpen(c)} aria-label={L("Detail karty", "Card detail")}>
                  {c ? <CardImg card={c} /> : <span className="cimg ph">{l.card_id}</span>}
                </button>
                <div className="tr-body">
                  <div className="row between gap">
                    <b className="tr-name">{c?.name ?? l.card_id}</b>
                    {isMatch(l) && <span className="chip hot">{L("Zhoda", "Match")}</span>}
                    {mine && <span className="tag dim">{l.kind === "offer" ? L("Ponúkam", "Offering") : L("Hľadám", "Wanted")}</span>}
                  </div>
                  <span className="small muted">
                    {l.card_id.split("_")[0]}
                    {c?.v ? ` · ${c.v}` : ""} · {l.qty}× · {l.cond} · {l.lang}
                  </span>
                  {priceBlock(l)}
                  {l.note && !mine && <span className="small tr-note">„{l.note}“</span>}
                  {mine ? (
                    <div className="tr-edit">
                      <select value={l.cond} onChange={async (e) => (await updateListing(l.id, { cond: e.target.value as any }), reload())} aria-label={L("Stav", "Condition")}>
                        {COND.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      <select value={l.lang} onChange={async (e) => (await updateListing(l.id, { lang: e.target.value as any }), reload())} aria-label={L("Jazyk", "Language")}>
                        <option>EN</option>
                        <option>JP</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        defaultValue={l.price ?? ""}
                        placeholder={L("cena €", "price €")}
                        onBlur={async (e) => (await updateListing(l.id, { price: e.target.value === "" ? null : Number(e.target.value) }), reload())}
                        aria-label={L("Cena v €", "Price in €")}
                      />
                      <input
                        defaultValue={l.note ?? ""}
                        placeholder={L("poznámka", "note")}
                        maxLength={300}
                        onBlur={async (e) => (await updateListing(l.id, { note: e.target.value || null }), reload())}
                        aria-label={L("Poznámka", "Note")}
                      />
                      <button className="btn ghost sm danger" onClick={async () => (await removeListing(l.id), reload())}>
                        {L("Zrušiť", "Remove")}
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
        {L("Grand Line Tracker len spája ľudí, výmenu či predaj si dohodnete sami.", "Grand Line Tracker only connects people, you arrange the trade or sale yourselves.")} {user && <><Link href="/zbierka">{L("Tvoja zbierka", "Your collection")}</Link> {L("je súkromná.", "is private.")}</>}
      </p>
    </div>
  );
}
