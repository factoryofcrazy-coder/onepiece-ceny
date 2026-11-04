"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { authError, nickError } from "@/lib/authErrors";
import { sb } from "@/lib/supabase";

const CONFIRM = "ZMAZAŤ";

export default function Account() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [nick, setNick] = useState("");
  const [nickMsg, setNickMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [delErr, setDelErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [passOk, setPassOk] = useState(false);

  useEffect(() => setNick(profile?.username ?? ""), [profile?.username]);
  useEffect(() => setPassOk(new URLSearchParams(window.location.search).get("heslo") === "ok"), []);

  if (loading) return <Loading what="Načítavam účet" />;
  if (!user) return <NeedLogin what="Účet" />;

  const saveNick = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = nickError(nick);
    if (bad) return setNickMsg({ t: bad });
    setSaving(true);
    setNickMsg(null);
    const { error } = await sb().from("profiles").update({ username: nick.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) return setNickMsg({ t: error.code === "23505" ? "Túto prezývku už niekto má." : error.code === "23514" ? "Takáto prezývka sa nedá použiť." : authError(error) });
    await refreshProfile();
    setNickMsg({ t: "Prezývka je uložená. V už rozohraných hrách ostane stará.", ok: true });
  };

  const remove = async () => {
    setDeleting(true);
    setDelErr("");
    const { error } = await sb().rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      return setDelErr(authError(error));
    }
    await sb().auth.signOut({ scope: "local" });
    window.location.assign("/");
  };

  return (
    <div className="ucet">
      <h1>Môj účet</h1>
      {passOk && <p className="okc">Heslo je zmenené.</p>}

      <section className="ucet-card">
        <h2>Prezývka</h2>
        <p className="muted small">Uvidia ju ostatní hráči v rebríčku, v hre aj na trhovisku.</p>
        <form onSubmit={saveNick} className="ucet-row">
          <input aria-label="Prezývka" required minLength={3} maxLength={24} value={nick} onChange={(e) => setNick(e.target.value)} />
          <button className="btn" disabled={saving || nick.trim() === (profile?.username ?? "")}>
            {saving ? "Ukladám…" : "Uložiť"}
          </button>
        </form>
        {nickMsg && <p className={nickMsg.ok ? "okc small" : "badc small"}>{nickMsg.t}</p>}
      </section>

      <section className="ucet-card">
        <h2>Prihlásenie</h2>
        <p className="muted small">E-mail: {user.email}. Ostatní ho nevidia.</p>
        <Link className="btn ghost sm" href="/nove-heslo">
          Zmeniť heslo
        </Link>
      </section>

      <section className="ucet-card ucet-danger">
        <h2>Zmazať účet</h2>
        <p className="muted small">
          Natrvalo zmaže účet, zbierku, decky, ponuky na trhovisku a hodnotenie v rebríčku. Zmažú sa aj hry, ktoré si založil, takže zmiznú aj súperom z histórie. Vrátiť sa to nedá.
        </p>
        <label className="field">
          <span>Na potvrdenie napíš {CONFIRM}</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn danger ghost" disabled={confirm !== CONFIRM || deleting} onClick={remove}>
          {deleting ? "Mažem…" : "Natrvalo zmazať účet"}
        </button>
        {delErr && <p className="badc small">{delErr}</p>}
      </section>

      <p className="small muted">
        Viac o tom, aké údaje ukladáme, nájdeš v <Link href="/sukromie">zásadách súkromia</Link>.
      </p>
    </div>
  );
}
