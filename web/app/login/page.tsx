"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { sb } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/karty");
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const redirect = window.location.origin;
    if (mode === "in") {
      const { error } = await sb().auth.signInWithPassword({ email, password: pass });
      if (error) setMsg({ t: error.message === "Invalid login credentials" ? "Zlý e-mail alebo heslo." : error.message });
    } else if (mode === "up") {
      const { data, error } = await sb().auth.signUp({
        email,
        password: pass,
        options: { data: { username: name.trim() || email.split("@")[0] }, emailRedirectTo: redirect },
      });
      if (error) setMsg({ t: error.message });
      else if (!data.session) setMsg({ t: "Hotovo – potvrď registráciu cez odkaz v e-maile.", ok: true });
    } else {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: redirect });
      setMsg(error ? { t: error.message } : { t: "Poslal som e-mail s odkazom na zmenu hesla.", ok: true });
    }
    setBusy(false);
  };

  return (
    <div className="login">
      <h1>{mode === "in" ? "Prihlásenie" : mode === "up" ? "Registrácia" : "Zabudnuté heslo"}</h1>
      <form onSubmit={submit} className="col gap">
        {mode === "up" && (
          <label className="field">
            <span>Prezývka</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="napr. Filip" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "reset" && (
          <label className="field">
            <span>Heslo</span>
            <input type="password" required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
        )}
        <button className="btn" disabled={busy}>
          {mode === "in" ? "Prihlásiť" : mode === "up" ? "Vytvoriť účet" : "Poslať odkaz"}
        </button>
        {msg && <p className={msg.ok ? "okc" : "badc"}>{msg.t}</p>}
      </form>
      <p className="small">
        {mode !== "in" && (
          <button className="link" onClick={() => setMode("in")}>
            Mám účet – prihlásiť
          </button>
        )}
        {mode !== "up" && (
          <button className="link" onClick={() => setMode("up")}>
            Nemám účet – registrovať
          </button>
        )}
        {mode === "in" && (
          <button className="link" onClick={() => setMode("reset")}>
            Zabudol som heslo
          </button>
        )}
      </p>
    </div>
  );
}
