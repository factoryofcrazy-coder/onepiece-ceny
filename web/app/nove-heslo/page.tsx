"use client";
// Sem vedie odkaz z e-mailu „zabudnuté heslo“ (Supabase prihlási používateľa cez odkaz) a tlačidlo v účte.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { authError } from "@/lib/authErrors";
import { sb } from "@/lib/supabase";

export default function NewPassword() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(/error_code=|error=/.test(window.location.hash));
  }, []);

  if (loading) return <Loading what="Overujem odkaz" />;

  if (!user)
    return (
      <div className="login">
        <h1>Odkaz nefunguje</h1>
        <p>{expired ? "Odkaz na zmenu hesla vypršal alebo už bol použitý." : "Na zmenu hesla potrebuješ platný odkaz z e-mailu."}</p>
        <p>
          <Link className="btn" href="/login">
            Poslať nový odkaz
          </Link>
        </p>
        <p className="tiny muted">Na prihlasovacej stránke zvoľ „Zabudol som heslo“.</p>
      </div>
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (a !== b) return setErr("Heslá sa nezhodujú.");
    setBusy(true);
    setErr("");
    const { error } = await sb().auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setErr(authError(error));
    router.replace("/ucet?heslo=ok");
  };

  return (
    <div className="login">
      <h1>Nové heslo</h1>
      <form onSubmit={save} className="col gap">
        <label className="field">
          <span>Nové heslo (aspoň 8 znakov)</span>
          <input type="password" required minLength={8} value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Zopakuj heslo</span>
          <input type="password" required minLength={8} value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Ukladám…" : "Uložiť heslo"}
        </button>
        {err && <p className="badc">{err}</p>}
      </form>
    </div>
  );
}
