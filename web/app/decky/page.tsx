"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CardImg, ColorDots, DataError, Loading, NeedLogin } from "@/components/ui";
import { loadProfiles, useAuth } from "@/lib/auth";
import { useCards } from "@/lib/data";
import { sb } from "@/lib/supabase";
import { useLang } from "@/lib/lang";

export type Deck = {
  id: string;
  user_id: string;
  name: string;
  leader_id: string | null;
  cards: Record<string, number>;
  notes: string | null;
  updated_at: string;
};

export default function DecksPage() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  const { data, error } = useCards();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    sb()
      .from("decks")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data }) => setDecks((data as Deck[]) ?? []));
    loadProfiles().then((p) => setNames(Object.fromEntries(p.map((x) => [x.id, x.username ?? "?"]))));
  }, [user]);

  if (loading) return <Loading />;
  if (!user) return <NeedLogin what="Deckbuilder" />;
  if (error) return <DataError error={error} file="cards" />;
  if (!data || !decks) return <Loading what={t("Načítavam decky", "Loading decks")} shape="tiles" />;

  const create = async () => {
    setBusy(true);
    const { data: d, error } = await sb().from("decks").insert({ name: t("Nový deck", "New deck") }).select().single();
    setBusy(false);
    if (error) return alert(error.message);
    router.push(`/decky/${d.id}`);
  };

  const mine = decks.filter((d) => d.user_id === user.id);
  const others = decks.filter((d) => d.user_id !== user.id);

  const Tile = ({ d }: { d: Deck }) => {
    const leader = d.leader_id ? data.byId.get(d.leader_id) : undefined;
    const count = Object.values(d.cards || {}).reduce((a, b) => a + b, 0);
    return (
      <Link href={`/decky/${d.id}`} className="dtile">
        {leader ? <CardImg card={leader} /> : <div className="cimg ph">{t("bez leadera", "no leader")}</div>}
        <div>
          <b>{d.name}</b>
          <div className="small muted">
            {leader ? (
              <>
                <ColorDots colors={leader.colors} /> {leader.name}
              </>
            ) : (
              "–"
            )}
          </div>
          <div className={`small ${count === 50 ? "okc" : "muted"}`}>{count}/50 {t("kariet", "cards")}</div>
          {d.user_id !== user.id && <div className="small muted">{t("od", "by")} {names[d.user_id] ?? t("kamoša", "a friend")}</div>}
        </div>
      </Link>
    );
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>{t("Decky", "Decks")}</h1>
          <p className="muted small">{t("1 leader + 50 kariet, max. 4 kópie, farby podľa leadera", "1 leader + 50 cards, max. 4 copies, colors by leader")}</p>
        </div>
        <div className="row gap wrapr">
          <Link className="btn ghost" href="/decky/odporucanie">
            {t("Čo si viem poskladať", "What can I build")}
          </Link>
          <button className="btn" onClick={create} disabled={busy}>
            + {t("Nový deck", "New deck")}
          </button>
        </div>
      </div>
      <h2 className="sub">{t("Moje decky", "My decks")}</h2>
      {mine.length ? (
        <div className="dgrid">
          {mine.map((d) => (
            <Tile key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <div className="empty">{t("Zatiaľ žiadny deck.", "No decks yet.")}</div>
      )}
      {others.length > 0 && (
        <>
          <h2 className="sub">{t("Decky kamošov", "Friends' decks")}</h2>
          <div className="dgrid">
            {others.map((d) => (
              <Tile key={d.id} d={d} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
