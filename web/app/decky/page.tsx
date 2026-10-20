"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CardImg, ColorDots, DataError, Loading, NeedLogin } from "@/components/ui";
import { loadProfiles, useAuth } from "@/lib/auth";
import { useCards } from "@/lib/data";
import { sb } from "@/lib/supabase";

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
  if (!data || !decks) return <Loading what="Načítavam decky" shape="tiles" />;

  const create = async () => {
    setBusy(true);
    const { data: d, error } = await sb().from("decks").insert({ name: "Nový deck" }).select().single();
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
        {leader ? <CardImg card={leader} /> : <div className="cimg ph">bez leadera</div>}
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
          <div className={`small ${count === 50 ? "okc" : "muted"}`}>{count}/50 kariet</div>
          {d.user_id !== user.id && <div className="small muted">od {names[d.user_id] ?? "kamoša"}</div>}
        </div>
      </Link>
    );
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Decky</h1>
          <p className="muted small">1 leader + 50 kariet, max. 4 kópie, farby podľa leadera</p>
        </div>
        <button className="btn" onClick={create} disabled={busy}>
          + Nový deck
        </button>
      </div>
      <h2 className="sub">Moje decky</h2>
      {mine.length ? (
        <div className="dgrid">
          {mine.map((d) => (
            <Tile key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <div className="empty">Zatiaľ žiadny deck.</div>
      )}
      {others.length > 0 && (
        <>
          <h2 className="sub">Decky kamošov</h2>
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
