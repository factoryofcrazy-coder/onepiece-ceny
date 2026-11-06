"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardImg, CardModal, Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Card, eur, useCards } from "@/lib/data";
import { dmCall, DmConversation, DmMember, DmMessage, DmSearchHit, useDm } from "@/lib/dm/client";
import { fmtDmDay, fmtDmTime, hasLink, previewOf, splitLinks } from "@/lib/dm/text";
import { disablePush, enablePush, pushStatus, PushStatus } from "@/lib/dm/push-client";
import { sb } from "@/lib/supabase";
import { ReactionAdd, ReactionPanel, ReactionPills, tapToReact } from "@/components/reactions/Reactions";
import { applyReaction, EmoteId, isEmote } from "@/lib/reactions";
import { useLang } from "@/lib/lang";

const MAX = 1000;
const LANG_COND = (l: { cond: string; lang: string }) => `${l.cond} · ${l.lang}`;
type Pending = DmMessage & { state?: "sending" | "failed"; send?: { text: string; cardId?: string; listingId?: string } };

function Avatar({ name }: { name: string }) {
  return (
    <span className="dm-av" aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Body({ m, trusted, onCard }: { m: DmMessage; trusted: boolean; onCard: (c: Card) => void }) {
  const { t: L, lang, locale } = useLang();
  const { data: cards } = useCards();
  if (!m.body) return <p className="dm-unreadable">{L("Správu sa nepodarilo načítať.", "Couldn't load the message.")}</p>;
  const card = m.body.card;
  const c = card ? cards?.byId.get(card.id) : undefined;
  const listing = card?.listing;
  return (
    <>
      {card && (
        <button type="button" className="dm-card" onClick={() => c && onCard(c)} disabled={!c} aria-label={`Detail karty ${c?.name ?? card.id}`}>
          {c ? <CardImg card={c} /> : <span className="cimg ph">{card.id.split("_")[0]}</span>}
          <span className="dm-card-text">
            <b>{c?.name ?? card.id}</b>
            <i>
              {card.id.split("_")[0]}
              {listing ? ` · ${LANG_COND(listing)}` : ""}
            </i>
            {listing && <strong>{listing.price != null ? (listing.kind === "want" ? L(`hľadá do ${eur(listing.price)}`, `wants up to ${eur(listing.price)}`) : eur(listing.price)) : listing.kind === "want" ? L("Hľadá", "Wanted") : L("Na výmenu", "For trade")}</strong>}
          </span>
        </button>
      )}
      {m.body.text && (
        <p className="dm-text">
          {splitLinks(m.body.text).map((p, i) =>
            p.t === "link" && trusted ? (
              <a key={i} href={p.v} target="_blank" rel="noopener noreferrer nofollow ugc">
                {p.v}
              </a>
            ) : (
              <span key={i}>{p.v}</span>
            ),
          )}
        </p>
      )}
      {m.body.text && trusted && hasLink(m.body.text) && <p className="dm-warn">{L("Odkaz od hráča. Pred zadaním údajov si over, kam vedie.", "Link from a player. Check where it leads before entering any details.")}</p>}
    </>
  );
}

function CardPicker({ onPick, onClose }: { onPick: (c: Card) => void; onClose: () => void }) {
  const { t: L, lang, locale } = useLang();
  const { data: cards } = useCards();
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const found = s.length >= 2 && cards ? cards.cards.filter((c) => c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)).slice(0, 8) : [];
  return (
    <div className="dm-picker">
      <div className="dm-picker-head">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Meno alebo kód karty", "Card name or code")} aria-label={L("Karta na priloženie", "Card to attach")} />
        <button type="button" className="btn ghost sm" onClick={onClose}>
          {L("Zavrieť", "Close")}
        </button>
      </div>
      {found.length > 0 && (
        <ul>
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}>
                <CardImg card={c} />
                <span>
                  <b>{c.name}</b>
                  <i>
                    {c.code}
                    {c.v ? ` · ${c.v}` : ""}
                  </i>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Conversation({
  conv,
  attach,
  onBack,
  onChanged,
}: {
  conv: DmConversation;
  attach: { cardId?: string; listingId?: string } | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t: L, lang, locale } = useLang();
  const { user } = useAuth();
  const me = user!.id;
  const { listen, refresh } = useDm();
  const { data: cards } = useCards();
  const [msgs, setMsgs] = useState<Pending[] | null>(null);
  const [more, setMore] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [otherRead, setOtherRead] = useState(conv.other_last_read_at);
  const [typing, setTyping] = useState(false);
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [attachment, setAttachment] = useState(attach);
  const [open, setOpen] = useState<Card | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [rxOpen, setRxOpen] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const typingCh = useRef<ReturnType<ReturnType<typeof sb>["channel"]> | null>(null);
  const lastTyping = useRef(0);
  const typingOff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = conv.id;
  const canSignal = conv.status === "accepted" && !conv.blocked_by_me;

  const merge = useCallback((incoming: Pending[]) => {
    setMsgs((cur) => {
      const m = new Map((cur ?? []).map((x) => [x.id, x]));
      for (const x of incoming) m.set(x.id, x);
      return [...m.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const patchReaction = (messageId: string, emote: string, user: string, on: boolean) =>
    setMsgs((cur) => cur && cur.map((x) => (x.id === messageId ? { ...x, reactions: applyReaction(x.reactions, emote, user, on) } : x)));

  const toBottom = () => requestAnimationFrame(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  });

  const markRead = useCallback(async () => {
    if (document.hidden) return;
    await dmCall("read", { conversationId: id }).catch(() => null);
    refresh();
  }, [id, refresh]);

  const fetchLatest = useCallback(async () => {
    const rows = await dmCall<DmMessage[]>("history", { conversationId: id });
    merge(rows);
    return rows;
  }, [id, merge]);

  useEffect(() => {
    setMsgs(null);
    setError("");
    setNotice("");
    setTyping(false);
    setOtherRead(conv.other_last_read_at);
    setAttachment(attach);
    fetchLatest()
      .then((rows) => {
        setMore(rows.length >= 50);
        toBottom();
        markRead();
      })
      .catch((e) => setError(e.message));
    // id určuje konverzáciu, ostatné hodnoty sú len počiatočné
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(
    () =>
      listen((row: DmMember) => {
        if (row.conversation_id !== id) return;
        if (row.user_id !== me) return setOtherRead(row.last_read_at);
        if (row.unread > 0) {
          setTyping(false);
          fetchLatest().then(() => {
            toBottom();
            markRead();
            onChanged();
          });
        }
      }),
    [listen, id, me, fetchLatest, markRead, onChanged],
  );

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        fetchLatest().catch(() => null);
        markRead();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchLatest, markRead]);

  useEffect(() => {
    if (!canSignal) return;
    const ch = sb()
      .channel(`dm:${id}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, () => {
        setTyping(true);
        clearTimeout(typingOff.current);
        typingOff.current = setTimeout(() => setTyping(false), 4000);
      })
      // len signál na obrazovke druhého: skutočný stav je v databáze a načíta sa s históriou
      .on("broadcast", { event: "react" }, ({ payload }) => {
        if (isEmote(payload?.emote)) patchReaction(String(payload.messageId), payload.emote, conv.other_id, payload.on === true);
      })
      .subscribe();
    typingCh.current = ch;
    return () => {
      typingCh.current = null;
      clearTimeout(typingOff.current);
      sb().removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, canSignal]);

  const toggleReaction = async (messageId: string, emote: EmoteId, on: boolean) => {
    setError("");
    patchReaction(messageId, emote, me, on); // hneď na obrazovke, pri chybe sa vráti
    try {
      await dmCall("react", { messageId, emote, on });
      typingCh.current?.send({ type: "broadcast", event: "react", payload: { messageId, emote, on } });
    } catch (e: any) {
      patchReaction(messageId, emote, me, !on);
      setError(e.message);
    }
  };

  const onType = (v: string) => {
    setText(v);
    if (!v || Date.now() - lastTyping.current < 2500) return;
    lastTyping.current = Date.now();
    typingCh.current?.send({ type: "broadcast", event: "typing", payload: {} });
  };

  const deliver = async (m: Pending) => {
    try {
      const saved = await dmCall<DmMessage>("send", { id: m.id, conversationId: id, ...m.send });
      merge([saved]);
      setError("");
      onChanged();
    } catch (e: any) {
      merge([{ ...m, state: "failed" }]);
      setError(e.message);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body && !attachment) return;
    const send = { text: body, ...(attachment ?? {}) };
    const card = attachment?.cardId ? { id: attachment.cardId } : undefined;
    const m: Pending = {
      id: crypto.randomUUID(),
      conversation_id: id,
      sender_id: me,
      created_at: new Date().toISOString(),
      body: { text: body, ...(card ? { card } : {}) },
      unreadable: false,
      state: "sending",
      send,
    };
    merge([m]);
    setText("");
    setAttachment(null);
    setPicker(false);
    toBottom();
    await deliver(m);
    toBottom();
  };

  const older = async () => {
    if (!msgs?.length) return;
    const el = list.current;
    const height = el?.scrollHeight ?? 0;
    const rows = await dmCall<DmMessage[]>("history", { conversationId: id, before: msgs[0].created_at });
    setMore(rows.length >= 50);
    merge(rows);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - height;
    });
  };

  const act = async (op: string, body: Record<string, unknown>, done: string) => {
    setMenu(false);
    try {
      await dmCall(op, body);
      setNotice(done);
      setError("");
      onChanged();
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const sendReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!reporting) return;
    await act("report", { messageId: reporting, reason }, L("Správa je nahlásená.", "Message reported."));
    setReporting(null);
    setReason("");
  };

  const mine = (msgs ?? []).filter((m) => m.sender_id === me && !m.state);
  const lastMine = mine[mine.length - 1];
  const seen = lastMine && otherRead && otherRead >= lastMine.created_at;
  const waiting = conv.status !== "accepted" && !conv.incoming_request && (msgs ?? []).some((m) => m.sender_id === me);
  const canWrite = !conv.blocked_by_me && !conv.incoming_request && !waiting;
  const trusted = conv.status === "accepted";
  const attachedCard = attachment?.cardId ? cards?.byId.get(attachment.cardId) : undefined;
  const days = useMemo(() => {
    let last = "";
    return (msgs ?? []).map((m) => {
      const d = fmtDmDay(m.created_at, new Date(), locale);
      const show = d !== last;
      last = d;
      return show ? d : "";
    });
  }, [msgs]);

  return (
    <section className="dm-conv" aria-label={L(`Konverzácia s hráčom ${conv.other_name}`, `Conversation with ${conv.other_name}`)}>
      <header className="dm-conv-head">
        <button className="dm-back" onClick={onBack} aria-label={L("Späť na zoznam", "Back to list")}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <Avatar name={conv.other_name} />
        <b className="dm-conv-name">{conv.other_name}</b>
        <div className="dm-menu-wrap">
          <button className="dm-menu-btn" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={L("Možnosti konverzácie", "Conversation options")}>
            ⋯
          </button>
          {menu && (
            <div className="dm-menu" role="menu">
              {conv.blocked_by_me ? (
                <button role="menuitem" onClick={() => act("block", { userId: conv.other_id, on: false }, L("Hráč je odblokovaný.", "Player unblocked."))}>
                  {L("Odblokovať hráča", "Unblock player")}
                </button>
              ) : (
                <button role="menuitem" onClick={() => act("block", { userId: conv.other_id, on: true }, L("Hráč je zablokovaný.", "Player blocked."))}>
                  {L("Zablokovať hráča", "Block player")}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="dm-list" ref={list} aria-live="polite">
        {more && (
          <button className="link dm-older" onClick={older}>
            {L("Staršie správy", "Older messages")}
          </button>
        )}
        {!msgs ? (
          <p className="muted small">{L("Načítavam správy…", "Loading messages…")}</p>
        ) : msgs.length === 0 ? (
          <p className="muted small dm-empty-conv">{L("Prvá správa príde hráčovi ako žiadosť. Ďalšie môžeš poslať, keď ju prijme.", "Your first message arrives as a request. You can send more once they accept it.")}</p>
        ) : (
          msgs.map((m, i) => (
            <div key={m.id} className="dm-row-wrap">
              {days[i] && <div className="dm-day">{days[i]}</div>}
              <div
                className={`dm-msg ${m.sender_id === me ? "me" : "other"} ${m.state ?? ""}`}
                onClick={(e) => !m.state && m.body && tapToReact(e, () => setRxOpen(rxOpen === m.id ? null : m.id))}
              >
                <Body m={m} trusted={trusted} onCard={setOpen} />
                <ReactionPills rows={m.reactions} me={me} nameOf={() => conv.other_name} canReact={trusted && !conv.blocked_by_me} onToggle={(emote, on) => toggleReaction(m.id, emote, on)} />
                <span className="dm-meta">
                  {m.state === "sending" ? L("Odosiela sa…", "Sending…") : m.state === "failed" ? L("Neodoslané", "Not sent") : fmtDmTime(m.created_at, new Date(m.created_at), locale)}
                  {m.state === "failed" && (
                    <button className="link" onClick={() => (merge([{ ...m, state: "sending" }]), deliver(m))}>
                      {L("Skúsiť znova", "Retry")}
                    </button>
                  )}
                  {m.sender_id !== me && !m.state && m.body && (
                    <button className="link dm-report" onClick={() => setReporting(m.id)}>
                      {L("Nahlásiť", "Report")}
                    </button>
                  )}
                  {!m.state && m.body && (trusted && !conv.blocked_by_me || (m.reactions?.length ?? 0) > 0) && (
                    <ReactionAdd open={rxOpen === m.id} onClick={() => setRxOpen(rxOpen === m.id ? null : m.id)} />
                  )}
                </span>
              </div>
              {rxOpen === m.id && (
                <ReactionPanel
                  rows={m.reactions}
                  me={me}
                  nameOf={() => conv.other_name}
                  canReact={trusted && !conv.blocked_by_me}
                  align={m.sender_id === me ? "end" : undefined}
                  onToggle={(emote, on) => toggleReaction(m.id, emote, on)}
                  onClose={() => setRxOpen(null)}
                />
              )}
            </div>
          ))
        )}
        {seen && <div className="dm-seen">{L("Prečítané", "Read")} {fmtDmTime(otherRead!, new Date(otherRead!), locale)}</div>}
        {typing && <div className="dm-typing">{conv.other_name} {L("píše…", "is typing…")}</div>}
      </div>

      {error && <p className="badc small dm-note">{error}</p>}
      {notice && !error && <p className="okc small dm-note">{notice}</p>}

      {reporting && (
        <form className="dm-report-form" onSubmit={sendReport}>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={L("Prečo správu nahlasuješ? (nepovinné)", "Why are you reporting it? (optional)")} aria-label={L("Dôvod nahlásenia", "Report reason")} />
          <button className="btn sm">{L("Nahlásiť", "Report")}</button>
          <button type="button" className="btn ghost sm" onClick={() => setReporting(null)}>
            {L("Zrušiť", "Cancel")}
          </button>
          <p className="tiny muted">{L("Správca uvidí túto správu a najviac 5 správ pred ňou a po nej, nie celú konverzáciu.", "The admin will see this message and at most 5 messages before and after it, not the whole conversation.")}</p>
        </form>
      )}

      {conv.incoming_request ? (
        <div className="dm-request">
          <p>
            <b>{conv.other_name}</b> {L("ti chce napísať. Kým žiadosť neprijmeš, nevie, či si správu videl.", "wants to message you. Until you accept, they won't know if you've seen it.")}
          </p>
          <div className="row gap">
            <button className="btn sm" onClick={() => act("respond", { conversationId: id, accept: true }, L("Žiadosť je prijatá.", "Request accepted."))}>
              {L("Prijať", "Accept")}
            </button>
            <button className="btn ghost sm" onClick={() => act("respond", { conversationId: id, accept: false }, L("Žiadosť je odmietnutá.", "Request declined."))}>
              {L("Odmietnuť", "Decline")}
            </button>
            <button className="btn ghost sm danger" onClick={() => act("block", { userId: conv.other_id, on: true }, L("Hráč je zablokovaný.", "Player blocked."))}>
              {L("Zablokovať", "Block")}
            </button>
          </div>
        </div>
      ) : conv.blocked_by_me ? (
        <p className="dm-closed small muted">{L("Tento hráč je zablokovaný. Odblokuješ ho v ponuke vpravo hore.", "This player is blocked. Unblock them in the menu at the top right.")}</p>
      ) : waiting ? (
        <p className="dm-closed small muted">{L("Žiadosť je odoslaná. Ďalšie správy môžeš poslať, keď ju hráč prijme.", "Request sent. You can send more messages once the player accepts.")}</p>
      ) : null}

      {canWrite && (
        <>
          {picker && (
            <CardPicker
              onClose={() => setPicker(false)}
              onPick={(c) => {
                setAttachment({ cardId: c.id });
                setPicker(false);
              }}
            />
          )}
          {attachment && (
            <div className="dm-attached">
              <span>{attachment.listingId ? L("Priložená ponuka", "Attached listing") : L("Priložená karta", "Attached card")}: {attachedCard?.name ?? attachment.cardId ?? L("ponuka", "listing")}</span>
              <button type="button" className="link" onClick={() => setAttachment(null)}>
                {L("Odstrániť", "Remove")}
              </button>
            </div>
          )}
          <form className="dm-form" onSubmit={submit}>
            <button type="button" className="dm-attach" onClick={() => setPicker(!picker)} aria-label={L("Priložiť kartu", "Attach card")} title={L("Priložiť kartu", "Attach card")}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="6" y="3" width="12" height="18" rx="2" />
                <path d="M12 9v6M9 12h6" />
              </svg>
            </button>
            <textarea
              rows={1}
              value={text}
              maxLength={MAX}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={L("Napíš správu", "Write a message")}
              aria-label={L("Správa", "Message")}
            />
            <button className="dm-send" disabled={!text.trim() && !attachment} aria-label={L("Odoslať", "Send")}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                <path d="M4 12 3 4l18 8-18 8 1-8Zm0 0h9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </>
      )}
      {open && <CardModal card={open} usd={1.12} onClose={() => setOpen(null)} />}
    </section>
  );
}

function NewConversation({ onClose }: { onClose: () => void }) {
  const { t: L, lang, locale } = useLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return setFound([]);
    const t = setTimeout(() => {
      dmCall<{ id: string; name: string }[]>("find", { q: s }).then(setFound).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="dm-new">
      <div className="dm-picker-head">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Prezývka hráča", "Player nickname")} aria-label={L("Hľadať hráča", "Find player")} />
        <button className="btn ghost sm" onClick={onClose}>
          {L("Zavrieť", "Close")}
        </button>
      </div>
      {found.map((u) => (
        <button key={u.id} className="dm-new-row" onClick={() => (onClose(), router.push(`/spravy?to=${u.id}`))}>
          <Avatar name={u.name} />
          {u.name}
        </button>
      ))}
      {q.trim().length >= 2 && !found.length && <p className="tiny muted">{L("Nikoho takého sme nenašli.", "No one found.")}</p>}
    </div>
  );
}

function Settings({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t: L, lang, locale } = useLang();
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [showText, setShowText] = useState(true);
  const [blocks, setBlocks] = useState<{ id: string; name: string }[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    pushStatus().then(setStatus);
    dmCall<{ show_text: boolean }>("settings").then((s) => setShowText(s.show_text)).catch(() => null);
    dmCall<{ id: string; name: string }[]>("blocks").then(setBlocks).catch(() => null);
    if (isAdmin) dmCall<any[]>("admin_reports").then(setReports).catch((e) => setMsg(e.message));
  }, [isAdmin]);
  const togglePush = async (on: boolean) => {
    setMsg("");
    try {
      await (on ? enablePush() : disablePush());
    } catch (e: any) {
      setMsg(e.message);
    }
    setStatus(await pushStatus());
  };
  const toggleText = async (on: boolean) => {
    setShowText(on);
    await dmCall("settings_set", { showText: on }).catch((e) => setMsg(e.message));
  };
  return (
    <div className="dm-settings">
      <div className="row between gap">
        <h2>Nastavenia</h2>
        <button className="btn ghost sm" onClick={onClose}>
          {L("Zavrieť", "Close")}
        </button>
      </div>
      <section>
        <h2>{L("Notifikácie", "Notifications")}</h2>
        {status === "ios-install" ? (
          <p className="small muted">
            {L("Na iPhone fungujú notifikácie až po", "On iPhone, notifications only work after")} <Link href="/aplikacia">{L("pridaní webu na plochu", "adding the site to your home screen")}</Link>. {L("Potom sa sem vráť a zapni ich.", "Then come back here and turn them on.")}
          </p>
        ) : status === "unsupported" ? (
          <p className="small muted">{L("Tento prehliadač notifikácie nepodporuje.", "This browser doesn't support notifications.")}</p>
        ) : status === "denied" ? (
          <p className="small muted">
            {L("Notifikácie sú pre tento web zablokované. Android: v prehliadači ťukni na ikonu vedľa adresy, Povolenia, Notifikácie. iPhone: Nastavenia, Hlásenia, Grand Line. Potom sa sem vráť.", "Notifications are blocked for this site. Android: tap the icon next to the address, Permissions, Notifications. iPhone: Settings, Notifications, Grand Line. Then come back here.")}
          </p>
        ) : status === "off-server" ? (
          <p className="small muted">{L("Notifikácie zatiaľ nie sú na serveri zapnuté.", "Notifications aren't enabled on the server yet.")}</p>
        ) : (
          <label className="dm-setting">
            <input type="checkbox" checked={status === "on"} disabled={!status} onChange={(e) => togglePush(e.target.checked)} />
            <span>
              {L("Notifikácie na tomto zariadení", "Notifications on this device")}
              <small>{L("Po odhlásení sa na zariadení vypnú.", "They turn off on this device when you sign out.")}</small>
            </span>
          </label>
        )}
        <label className="dm-setting" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={showText} onChange={(e) => toggleText(e.target.checked)} />
          <span>
            {L("Zobraziť text správy v notifikácii", "Show message text in notifications")}
            <small>{L("Text uvidí každý, kto sa pozrie na zamknutú obrazovku. Žiadosti od cudzích sú vždy bez textu.", "Anyone looking at your lock screen will see the text. Requests from strangers never show text.")}</small>
          </span>
        </label>
        {msg && <p className="badc small">{msg}</p>}
      </section>
      <section>
        <h2>{L("Zablokovaní hráči", "Blocked players")}</h2>
        {!blocks.length && <p className="small muted">{L("Nikoho nemáš zablokovaného.", "You haven't blocked anyone.")}</p>}
        {blocks.map((b) => (
          <div key={b.id} className="dm-block-row">
            {b.name}
            <button
              className="btn ghost sm"
              onClick={async () => {
                await dmCall("block", { userId: b.id, on: false });
                setBlocks((x) => x.filter((y) => y.id !== b.id));
                onChanged();
              }}
            >
              {L("Odblokovať", "Unblock")}
            </button>
          </div>
        ))}
      </section>
      {isAdmin && (
        <section>
          <h2>{L("Nahlásené správy", "Reported messages")} ({reports.length})</h2>
          <p className="tiny muted">{L("Vidíš nahlásenú správu a najviac 5 správ pred ňou a po nej, nie zvyšok konverzácie.", "You see the reported message and at most 5 messages before and after it, not the rest of the conversation.")}</p>
          {reports.map((r) => (
            <div key={r.id} className="dm-admin-item">
              {[...(r.context ?? []).filter((m: any) => m.created_at < r.message_at), { id: r.id, sender_name: r.sender_name, body: r.body, unreadable: r.unreadable, reported: true }, ...(r.context ?? []).filter((m: any) => m.created_at > r.message_at)].map((m: any) => (
                <p key={m.id} className={m.reported ? "dm-admin-hit" : "dm-admin-ctx"}>
                  <b>{m.sender_name}:</b> {m.unreadable ? L("Správu sa nepodarilo načítať.", "Couldn't load the message.") : m.body?.text || `${L("Karta", "Card")} ${m.body?.card?.id ?? ""}`}
                </p>
              ))}
              <span className="tiny">
                {L(`Od ${r.sender_name}, nahlásil ${r.reporter_name}`, `From ${r.sender_name}, reported by ${r.reporter_name}`)}
                {r.reason ? `: ${r.reason}` : ""}
              </span>
              <button
                className="btn ghost sm"
                style={{ alignSelf: "flex-start" }}
                onClick={async () => {
                  await dmCall("admin_resolve", { id: r.id });
                  setReports((x) => x.filter((y) => y.id !== r.id));
                }}
              >
                {L("Vybavené", "Resolved")}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function Messages() {
  const { t: L, lang, locale } = useLang();
  const { user, loading } = useAuth();
  const { listen } = useDm();
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("c");
  const [list, setList] = useState<DmConversation[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DmSearchHit[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [attach, setAttach] = useState<{ cardId?: string; listingId?: string } | null>(null);
  const started = useRef("");

  const load = useCallback(async () => {
    try {
      setList(await dmCall<DmConversation[]>("list"));
      setError("");
    } catch (e: any) {
      setError(e.message);
      setList((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    document.body.classList.add("dm-open");
    return () => document.body.classList.remove("dm-open");
  }, []);

  useEffect(() => {
    if (!user) return;
    return listen((row) => {
      if (row.user_id === user.id) load();
    });
  }, [user, listen, load]);

  // začatie konverzácie z trhoviska, rebríčka alebo chatu
  const to = params.get("to");
  const listing = params.get("listing");
  const card = params.get("card");
  useEffect(() => {
    if (!user || !to) return;
    const key = `${to}|${listing}|${card}`;
    if (started.current === key) return;
    started.current = key;
    dmCall<{ id: string }>("open", { userId: to })
      .then(async ({ id }) => {
        setAttach(listing ? { listingId: listing, cardId: card ?? undefined } : card ? { cardId: card } : null);
        await load();
        router.replace(`/spravy?c=${id}`);
      })
      .catch((e) => {
        setError(e.message);
        router.replace("/spravy");
      });
  }, [user, to, listing, card, load, router]);

  const runSearch = async (e?: FormEvent, before?: string | null) => {
    e?.preventDefault();
    const s = q.trim();
    if (s.length < 2) return setHits(null);
    setSearching(true);
    try {
      const r = await dmCall<{ results: DmSearchHit[]; next: string | null }>("search", { q: s, before: before ?? undefined });
      setHits((h) => (before ? [...(h ?? []), ...r.results] : r.results));
      setNext(r.next);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
    setSearching(false);
  };

  if (loading) return <Loading what={L("Načítavam správy", "Loading messages")} shape="rows" />;
  if (!user) return <NeedLogin what={L("Súkromné správy", "Messages")} />;

  const conv = list?.find((c) => c.id === active);
  const requests = (list ?? []).filter((c) => c.incoming_request);
  const normal = (list ?? []).filter((c) => !c.incoming_request);
  const row = (c: DmConversation) => (
    <Link key={c.id} href={`/spravy?c=${c.id}`} className={`dm-item ${c.id === active ? "on" : ""}`} aria-current={c.id === active ? "true" : undefined}>
      <Avatar name={c.other_name} />
      <span className="dm-item-text">
        <b>{c.other_name}</b>
        <span>{c.last_message ? `${c.last_message.sender_id === user.id ? L("Ty: ", "You: ") : ""}${previewOf(c.last_message.body, lang === "en")}` : L("Bez správ", "No messages")}</span>
      </span>
      <span className="dm-item-side">
        <time>{fmtDmTime(c.last_message_at, new Date(), locale)}</time>
        {c.unread > 0 && <span className="dm-count">{c.unread > 99 ? "99+" : c.unread}</span>}
      </span>
    </Link>
  );

  return (
    <div className={`dm-page ${active ? "has-conv" : ""}`}>
      <aside className="dm-side">
        <header className="dm-side-head">
          <h1>{L("Správy", "Messages")}</h1>
          <div className="row gap">
            <button className="btn ghost sm" onClick={() => setNewOpen(!newOpen)}>
              {L("Nová správa", "New message")}
            </button>
            <button className="dm-menu-btn" onClick={() => setSettings(!settings)} aria-expanded={settings} aria-label={L("Nastavenia správ", "Message settings")} title={L("Nastavenia", "Settings")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="8" cy="17" r="2" />
              </svg>
            </button>
          </div>
        </header>
        {settings && <Settings onClose={() => setSettings(false)} onChanged={load} />}
        {newOpen && !settings && <NewConversation onClose={() => setNewOpen(false)} />}
        <form className="dm-search" hidden={settings} onSubmit={(e) => runSearch(e)} role="search">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!e.target.value) setHits(null);
            }}
            placeholder={L("Hľadať v správach", "Search messages")}
            aria-label={L("Hľadať v správach", "Search messages")}
          />
        </form>
        {error && <p className="badc small dm-note">{error}</p>}
        {settings ? null : hits ? (
          <div className="dm-scroll">
            <div className="dm-hits-head">
              <span className="tiny muted">{searching ? L("Hľadám…", "Searching…") : hits.length ? `${L("Nájdené", "Found")}: ${hits.length}` : L("Nič sa nenašlo.", "Nothing found.")}</span>
              <button className="link tiny" onClick={() => (setHits(null), setQ(""))}>
                {L("Zrušiť", "Cancel")}
              </button>
            </div>
            {hits.map((h) => (
              <Link key={h.id} href={`/spravy?c=${h.conversation_id}`} className="dm-item">
                <Avatar name={h.other_name} />
                <span className="dm-item-text">
                  <b>{h.other_name}</b>
                  <span className="dm-snip">{h.snippet}</span>
                </span>
                <span className="dm-item-side">
                  <time>{fmtDmTime(h.created_at, new Date(), locale)}</time>
                </span>
              </Link>
            ))}
            {next && !searching && (
              <button className="link dm-older" onClick={() => runSearch(undefined, next)}>
                {L("Hľadať v starších", "Search older")}
              </button>
            )}
          </div>
        ) : !list ? (
          <p className="muted small dm-note">{L("Načítavam konverzácie…", "Loading conversations…")}</p>
        ) : (
          <div className="dm-scroll">
            {requests.length > 0 && <div className="dm-group">{L("Žiadosti", "Requests")} ({requests.length})</div>}
            {requests.map(row)}
            {requests.length > 0 && normal.length > 0 && <div className="dm-group">{L("Konverzácie", "Conversations")}</div>}
            {normal.map(row)}
            {!list.length && <p className="muted small dm-note">{L("Zatiaľ tu nič nie je. Napíš hráčovi z trhoviska alebo cez Nová správa.", "Nothing here yet. Message a player from the marketplace or via New message.")}</p>}
          </div>
        )}
      </aside>
      <div className="dm-main">
        {conv ? (
          <Conversation key={conv.id} conv={conv} attach={attach} onBack={() => router.push("/spravy")} onChanged={load} />
        ) : (
          <div className="dm-placeholder">
            <p className="muted">{active && list ? L("Konverzácia sa nenašla.", "Conversation not found.") : L("Vyber si konverzáciu.", "Pick a conversation.")}</p>
            <p className="tiny muted">{L("Správy sú na serveri šifrované a po 12 mesiacoch sa zmažú.", "Messages are encrypted on the server and deleted after 12 months.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
