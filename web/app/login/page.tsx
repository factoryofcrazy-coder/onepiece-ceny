"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Captcha, { CAPTCHA_ON } from "@/components/Captcha";
import { useAuth } from "@/lib/auth";
import { authError, nickError } from "@/lib/authErrors";
import { sb } from "@/lib/supabase";
import { useLang } from "@/lib/lang";

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
  const { t: L, lang } = useLang();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/karty");
  }, [user, router]);

  // odkaz z potvrdzovacieho e-mailu vedie sem; pri vypršanom odkaze je chyba v adrese
  useEffect(() => {
    if (/error_code=|error=/.test(window.location.hash))
      setMsg({ t: L("Odkaz na potvrdenie vypršal alebo už bol použitý. Prihlás sa a pošleme ti nový.", "The confirmation link expired or was already used. Sign in and we'll send you a new one.") });
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
    setMsg(error ? { t: authError(error, lang) } : { t: L("Poslali sme nový odkaz. Pozri aj spam.", "We sent a new link. Check your spam too."), ok: true });
    newCaptcha();
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "up") {
      const bad = nickError(name, lang);
      if (bad) return setMsg({ t: bad });
      if (pass !== pass2) return setMsg({ t: L("Heslá sa nezhodujú.", "Passwords don't match.") });
    }
    setBusy(true);
    setMsg(null);
    if (mode === "up") {
      // obsadená prezývka: povieme to hneď, inak by databáza potichu pridala číslo (Anon → Anon1)
      const { data: free, error } = await sb().rpc("username_available", { p_name: name.trim() });
      if (!error && free === false) {
        setBusy(false);
        return setMsg({ t: L(`Prezývku „${name.trim()}“ už niekto má. Skús inú.`, `The nickname "${name.trim()}" is taken. Try another one.`) });
      }
    }
    const captchaToken = token ?? undefined;
    if (mode === "in") {
      const { error } = await sb().auth.signInWithPassword({ email, password: pass, options: { captchaToken } });
      if (error?.code === "email_not_confirmed") setVerify(email);
      else if (error) setMsg({ t: authError(error, lang) });
    } else if (mode === "up") {
      const { data, error } = await sb().auth.signUp({
        email,
        password: pass,
        options: { data: { username: name.trim() }, emailRedirectTo: confirmUrl(), captchaToken },
      });
      if (error) setMsg({ t: authError(error, lang) });
      else if (!data.session) setVerify(email);
    } else {
      const { error } = await sb().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nove-heslo`,
        captchaToken,
      });
      setMsg(error ? { t: authError(error, lang) } : { t: L("Ak máme účet s týmto e-mailom, poslali sme naň odkaz na zmenu hesla. Pozri aj spam.", "If we have an account with this e-mail, we sent a password reset link to it. Check your spam too."), ok: true });
    }
    newCaptcha();
    setBusy(false);
  };

  if (verify)
    return (
      <div className="login col gap">
        <h1>{L("Potvrď e-mail", "Confirm your e-mail")}</h1>
        <p>
          {L("Poslali sme odkaz na", "We sent a link to")} <b>{verify}</b>. {L("Klikni naň a účet bude hotový. Ak e-mail neprišiel, pozri aj spam.", "Click it and your account will be ready. If the e-mail didn't arrive, check your spam.")}
        </p>
        <Captcha key={captchaKey} onToken={setToken} />
        <button className="btn ghost" disabled={busy || (CAPTCHA_ON && !token)} onClick={resend}>
          {busy ? L("Posielam…", "Sending…") : L("Poslať odkaz znova", "Send the link again")}
        </button>
        {msg && <p className={msg.ok ? "okc" : "badc"}>{msg.t}</p>}
        <p className="small">
          <button className="link" onClick={() => pick("in")}>
            {L("Späť na prihlásenie", "Back to sign in")}
          </button>
        </p>
      </div>
    );

  return (
    <div className="login">
      <h1>{mode === "in" ? L("Prihlásenie", "Sign in") : mode === "up" ? L("Registrácia", "Sign up") : L("Zabudnuté heslo", "Forgotten password")}</h1>
      <form onSubmit={submit} className="col gap">
        {mode === "up" && (
          <label className="field">
            <span>{L("Prezývka (uvidia ju ostatní)", "Nickname (others will see it)")}</span>
            <input required minLength={3} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder={L("napr. Modrá Fúzia", "e.g. Blue Fusion")} autoComplete="nickname" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== "reset" && (
          <label className="field">
            <span>{L("Heslo", "Password")}{mode === "up" ? L(" (aspoň 8 znakov)", " (at least 8 characters)") : ""}</span>
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
            <span>{L("Zopakuj heslo", "Repeat password")}</span>
            <input type="password" required minLength={8} value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        <Captcha key={captchaKey} onToken={setToken} />
        <button className="btn" disabled={busy || (CAPTCHA_ON && !token)}>
          {busy ? L("Chvíľu strpenia…", "One moment…") : mode === "in" ? L("Prihlásiť sa", "Sign in") : mode === "up" ? L("Vytvoriť účet", "Create account") : L("Poslať odkaz", "Send link")}
        </button>
        {msg && <p className={msg.ok ? "okc" : "badc"}>{msg.t}</p>}
        {mode === "up" && (
          <p className="tiny muted">
            {L("Vytvorením účtu berieš na vedomie", "By creating an account you acknowledge the")} <Link href="/sukromie">{L("zásady súkromia", "privacy policy")}</Link>.
          </p>
        )}
      </form>
      <p className="small">
        {mode !== "in" && (
          <button className="link" onClick={() => pick("in")}>
            {L("Už mám účet – prihlásiť sa", "I have an account – sign in")}
          </button>
        )}
        {mode !== "up" && (
          <button className="link" onClick={() => pick("up")}>
            {L("Nemám účet – zaregistrovať sa", "No account – sign up")}
          </button>
        )}
        {mode === "in" && (
          <button className="link" onClick={() => pick("reset")}>
            {L("Zabudol som heslo", "I forgot my password")}
          </button>
        )}
      </p>
    </div>
  );
}
