"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CardImg, CardModal, DataError, Loading, NeedLogin } from "@/components/ui";
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
  const { list, traders, missing, loading: tLoading, reload, error: tError } = useTrades(!!user);
  const { qty } = useCollection(user?.id ?? null, false);
  const me = useMyContact(user?.id);
  const [tab, setTab] = useState<Tab>("offer");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Card | null>(null);
  const [msg, setMsg] = useState("");
  const [addQ, setAddQ] = useState("");

  const mineWant = useMemo(() => new Set(list.filter((l) => l.user_id === user?.id && l.kind === "want").map((l) => l.card_id)), [list, user]);
  const mineOffer = useMemo(() => new Set(list.filter((l) => l.user_id === user?.id && l.kind === "offer").map((l) => l.card_id)), [list, user]);

  if (tcg === "pokemon")
    return (
      <div className="tr-page">
        <h1>Trhovisko</h1>
        <p className="muted">Trhovisko je zatiaľ pre One Piece karty – prepni hore na One Piece.</p>
      </div>
    );
  if (loading) return <Loading shape="rows" />;
  if (!user) return <NeedLogin what="Trhovisko" />;
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
    l.user_id !== user.id && (l.kind === "offer" ? mineWant.has(l.card_id) : (qty[l.card_id] ?? 0) > 0 || mineOffer.has(l.card_id));
  const shown = list
    .filter((l) => (tab === "mine" ? l.user_id === user.id : l.kind === tab && l.user_id !== user.id))
    .filter(match)
    .sort((a, b) => Number(isMatch(b)) - Number(isMatch(a)));
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

  return (
    <div className="tr-page">
      <div className="tr-head">
        <div>
          <h1>Trhovisko</h1>
          <p className="muted">
            Označ karty, ktoré ponúkaš na výmenu alebo hľadáš. Pri zhode sa ozvi cez kontakt v profile.
            {matches > 0 && (
              <>
                {" "}
                <b className="tr-matchc">{matches} {matches === 1 ? "zhoda" : matches < 5 ? "zhody" : "zhôd"}</b> s tvojou zbierkou.
              </>
            )}
          </p>
        </div>
      </div>

      {missing && (
        <div className="empty warn">Trhovisko sa práve pripravuje – databáza ešte nemá tabuľku ponúk. Skús to o chvíľu.</div>
      )}
      {!missing && tError && <div className="empty warn">{tError}</div>}

      <div className="tr-tabs" role="tablist">
        {(Object.keys(TAB_SK) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {TAB_SK[t]}
            <span>{t === "mine" ? list.filter((l) => l.user_id === user.id).length : list.filter((l) => l.kind === t && l.user_id !== user.id).length}</span>
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <section className="tr-mine">
          <label className="tr-contact">
            <span>Tvoj kontakt (Discord, Instagram, Messenger…) – uvidia ho ostatní pri tvojich ponukách</span>
            <div className="row gap">
              <input value={me.contact} onChange={(e) => me.setContact(e.target.value)} placeholder="napr. Discord: hobo#1234" maxLength={120} />
              <button className="btn sm" onClick={async () => flash((await me.save(me.contact)) ?? "Kontakt uložený")}>
                Uložiť
              </button>
            </div>
          </label>
          <div className="tr-add">
            <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Pridať kartu – meno alebo kód (napr. OP05-119)" />
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
        <input className="tr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať kartu alebo hráča" />
      )}

      {msg && <div className="tr-msg">{msg}</div>}

      {tLoading ? (
        <Loading shape="rows" />
      ) : shown.length === 0 ? (
        <div className="empty">
          {tab === "mine" ? "Zatiaľ nič neponúkaš ani nehľadáš. Pridaj kartu vyššie alebo v detaile karty." : "Zatiaľ tu nič nie je."}
        </div>
      ) : (
        <ul className="tr-list">
          {shown.map((l) => {
            const c = card(l.card_id);
            const t = traders.get(l.user_id);
            const mine = l.user_id === user.id;
            return (
              <li key={l.id} className={isMatch(l) ? "match" : ""}>
                <button className="tr-img" onClick={() => c && setOpen(c)} aria-label="Detail karty">
                  {c ? <CardImg card={c} /> : <span className="cimg ph">{l.card_id}</span>}
                </button>
                <div className="tr-body">
                  <div className="row between gap">
                    <b className="tr-name">{c?.name ?? l.card_id}</b>
                    {isMatch(l) && <span className="chip hot">Zhoda</span>}
                  </div>
                  <span className="small muted">
                    {l.card_id}
                    {c?.v ? ` · ${c.v}` : ""} · {l.kind === "offer" ? "ponúka" : "hľadá"} {l.qty}× · {l.cond} · {l.lang}
                  </span>
                  <span className="small">
                    {l.price != null ? <b className="tr-price">{eur(l.price)}</b> : <span className="muted">na výmenu</span>}
                    {c && <span className="muted"> · Cardmarket {eur(cardEur(c, usd, l.lang))}</span>}
                  </span>
                  {l.note && <span className="small tr-note">„{l.note}“</span>}
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
                    <span className="tr-who small">
                      <b>{t?.username ?? "hráč"}</b> · {t?.contact ? <span className="tr-contactv">{t.contact}</span> : <span className="muted">bez kontaktu</span>} ·{" "}
                      <span className="muted">{ago(l.created_at)}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && <CardModal card={open} usd={usd} onClose={() => setOpen(null)} />}
      <p className="tiny muted" style={{ marginTop: 24 }}>
        Grand Line Tracker len spája ľudí – výmenu či predaj si dohodnete sami. <Link href="/zbierka">Tvoja zbierka</Link> je súkromná.
      </p>
    </div>
  );
}
