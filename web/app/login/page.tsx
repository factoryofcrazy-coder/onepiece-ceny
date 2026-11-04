"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Captcha, { CAPTCHA_ON } from "@/components/Captcha";
import { useAuth } from "@/lib/auth";
import { authError, nickError } from "@/lib/authErrors";
import { sb } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0); // token platí raz → po každom pokuse nový
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/karty");
  }, [user, router]);

  const pick = (m: typeof mode) => {
    setMode(m);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "up") {
      const bad = nickError(name);
      if (bad) return setMsg({ t: bad });
    }
    setBusy(true);
    setMsg(null);
    const captchaToken = token ?? undefined;
    if (mode === "in") {
      const { error } = await sb().auth.signInWithPassword({ email, password: pass, options: { captchaToken } });
      if (error) setMsg({ t: authError(error) });
    } else if (mode === "up") {
      const { data, error } = await sb().auth.signUp({
        email,
        password: pass,
        options: { data: { username: name.trim() }, emailRedirectTo: window.location.origin, captchaToken },
      });
      if (error) setMsg({ t: authError(error) });
      else if (!data.session) setMsg({ t: "Hotovo – potvrď registráciu cez odkaz v e-maile.", ok: true });
    } else {
      const { error } = await sb().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nove-heslo`,
        captchaToken,
      });
      setMsg(error ? { t: authError(error) } : { t: "Ak máme účet s týmto e-mailom, poslali sme naň odkaz na zmenu hesla. Pozri aj spam.", ok: true });
    }
    setToken(null);
    setCaptchaKey((k) => k + 1);
    setBusy(false);
  };

  return (
    <div className="login">
      <h1>{mode === "in" ? "Prihlásenie" : mode === "up" ? "Registrácia" : "Zabudnuté heslo"}</h1>
      <form onSubmit={submit} className="col gap">
        {mode === "up" && (
          <label className="field">
            <span>Prezývka (uvidia ju ostatní)</span>
            <input required minLength={3} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="napr. Anon" autoComplete="nickname" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== "reset" && (
          <label className="field">
            <span>Heslo{mode === "up" ? " (aspoň 8 znakov)" : ""}</span>
            <input
              type="password"
              required
              minLength={mode === "up" ? 8 : 6}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
            />
          </label>
        )}
        <Captcha key={captchaKey} onToken={setToken} />
        <button className="btn" disabled={busy || (CAPTCHA_ON && !token)}>
          {mode === "in" ? "Prihlásiť sa" : mode === "up" ? "Vytvoriť účet" : "Poslať odkaz"}
        </button>
        {msg && <p className={msg.ok ? "okc" : "badc"}>{msg.t}</p>}
        {mode === "up" && (
          <p className="tiny muted">
            Vytvorením účtu berieš na vedomie <Link href="/sukromie">zásady súkromia</Link>.
          </p>
        )}
      </form>
      <p className="small">
        {mode !== "in" && (
          <button className="link" onClick={() => pick("in")}>
            Už mám účet – prihlásiť sa
          </button>
        )}
        {mode !== "up" && (
          <button className="link" onClick={() => pick("up")}>
            Nemám účet – zaregistrovať sa
          </button>
        )}
        {mode === "in" && (
          <button className="link" onClick={() => pick("reset")}>
            Zabudol som heslo
          </button>
        )}
      </p>
    </div>
  );
}
