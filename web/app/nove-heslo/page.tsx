"use client";
// Sem vedie odkaz z e-mailu „zabudnuté heslo“ (Supabase prihlási používateľa cez odkaz) a tlačidlo v účte.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { authError } from "@/lib/authErrors";
import { sb } from "@/lib/supabase";
import { useLang } from "@/lib/lang";

export default function NewPassword() {
  const { user, loading } = useAuth();
  const { t, lang } = useLang();
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(/error_code=|error=/.test(window.location.hash));
  }, []);

  if (loading) return <Loading what={t("Overujem odkaz", "Checking the link")} />;

  if (!user)
    return (
      <div className="login">
        <h1>{t("Odkaz nefunguje", "The link doesn't work")}</h1>
        <p>{expired ? t("Odkaz na zmenu hesla vypršal alebo už bol použitý.", "The password reset link expired or was already used.") : t("Na zmenu hesla potrebuješ platný odkaz z e-mailu.", "To change your password you need a valid link from the e-mail.")}</p>
        <p>
          <Link className="btn" href="/login">
            {t("Poslať nový odkaz", "Send a new link")}
          </Link>
        </p>
        <p className="tiny muted">{t("Na prihlasovacej stránke zvoľ „Zabudol som heslo“.", "On the sign-in page choose \"I forgot my password\".")}</p>
      </div>
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (a !== b) return setErr(t("Heslá sa nezhodujú.", "Passwords don't match."));
    setBusy(true);
    setErr("");
    const { error } = await sb().auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setErr(authError(error, lang));
    router.replace("/ucet?heslo=ok");
  };

  return (
    <div className="login">
      <h1>{t("Nové heslo", "New password")}</h1>
      <form onSubmit={save} className="col gap">
        <label className="field">
          <span>{t("Nové heslo (aspoň 8 znakov)", "New password (at least 8 characters)")}</span>
          <input type="password" required minLength={8} value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>{t("Zopakuj heslo", "Repeat password")}</span>
          <input type="password" required minLength={8} value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? t("Ukladám…", "Saving…") : t("Uložiť heslo", "Save password")}
        </button>
        {err && <p className="badc">{err}</p>}
      </form>
    </div>
  );
}
