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
  const [pass2, setPass2] = useState("");
  const [verify, setVerify] = useState<string | null>(null); // e-mail čakajúci na potvrdenie
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

  // odkaz z potvrdzovacieho e-mailu vedie sem; pri vypršanom odkaze je chyba v adrese
  useEffect(() => {
    if (/error_code=|error=/.test(window.location.hash))
      setMsg({ t: "Odkaz na potvrdenie vypršal alebo už bol použitý. Prihlás sa a pošleme ti nový." });
  }, []);

  const pick = (m: typeof mode) => {
    setMode(m);
    setMsg(null);
    setVerify(null);
  };
  const newCaptcha = () => {
    setToken(null);
    setCaptchaKey((k) => k + 1);
  };
  const confirmUrl = () => `${window.location.origin}/login`;

  const resend = async () => {
    if (!verify) return;
    setBusy(true);
    setMsg(null);
    const { error } = await sb().auth.resend({
      type: "signup",
      email: verify,
      options: { emailRedirectTo: confirmUrl(), captchaToken: token ?? undefined },
    });
    setMsg(error ? { t: authError(error) } : { t: "Poslali sme nový odkaz. Pozri aj spam.", ok: true });
    newCaptcha();
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "up") {
      const bad = nickError(name);
      if (bad) return setMsg({ t: bad });
      if (pass !== pass2) return setMsg({ t: "Heslá sa nezhodujú." });
    }
    setBusy(true);
    setMsg(null);
    if (mode === "up") {
      // obsadená prezývka: povieme to hneď, inak by databáza potichu pridala číslo (Anon → Anon1)
      const { data: free, error } = await sb().rpc("username_available", { p_name: name.trim() });
      if (!error && free === false) {
        setBusy(false);
        return setMsg({ t: `Prezývku „${name.trim()}“ už niekto má. Skús inú.` });
      }
    }
    const captchaToken = token ?? undefined;
    if (mode === "in") {
      const { error } = await sb().auth.signInWithPassword({ email, password: pass, options: { captchaToken } });
      if (error?.code === "email_not_confirmed") setVerify(email);
      else if (error) setMsg({ t: authError(error) });
    } else if (mode === "up") {
      const { data, error } = await sb().auth.signUp({
        email,
        password: pass,
        options: { data: { username: name.trim() }, emailRedirectTo: confirmUrl(), captchaToken },
      });
      if (error) setMsg({ t: authError(error) });
      else if (!data.session) setVerify(email);
    } else {
      const { error } = await sb().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nove-heslo`,
        captchaToken,
      });
      setMsg(error ? { t: authError(error) } : { t: "Ak máme účet s týmto e-mailom, poslali sme naň odkaz na zmenu hesla. Pozri aj spam.", ok: true });
    }
    newCaptcha();
    setBusy(false);
  };

  if (verify)
    return (
      <div className="login col gap">
        <h1>Potvrď e-mail</h1>
        <p>
          Poslali sme odkaz na <b>{verify}</b>. Klikni naň a účet bude hotový. Ak e-mail neprišiel, pozri aj spam.
        </p>
        <Captcha key={captchaKey} onToken={setToken} />
        <button className="btn ghost" disabled={busy || (CAPTCHA_ON && !token)} onClick={resend}>
          {busy ? "Posielam…" : "Poslať odkaz znova"}
        </button>
        {msg && <p className={msg.ok ? "okc" : "badc"}>{msg.t}</p>}
        <p className="small">
          <button className="link" onClick={() => pick("in")}>
            Späť na prihlásenie
          </button>
        </p>
      </div>
    );

  return (
    <div className="login">
      <h1>{mode === "in" ? "Prihlásenie" : mode === "up" ? "Registrácia" : "Zabudnuté heslo"}</h1>
      <form onSubmit={submit} className="col gap">
        {mode === "up" && (
          <label className="field">
            <span>Prezývka (uvidia ju ostatní)</span>
            <input required minLength={3} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="napr. Modrá Fúzia" autoComplete="nickname" />
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
        {mode === "up" && (
          <label className="field">
            <span>Zopakuj heslo</span>
            <input type="password" required minLength={8} value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        <Captcha key={captchaKey} onToken={setToken} />
        <button className="btn" disabled={busy || (CAPTCHA_ON && !token)}>
          {busy ? "Chvíľu strpenia…" : mode === "in" ? "Prihlásiť sa" : mode === "up" ? "Vytvoriť účet" : "Poslať odkaz"}
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
