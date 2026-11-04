"use client";
// Cloudflare Turnstile pri prihlásení a registrácii. Bez kľúča NEXT_PUBLIC_TURNSTILE_SITE_KEY sa nič nezobrazí.
import { useEffect, useRef } from "react";

export const CAPTCHA_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

function loadScript(): Promise<void> {
  return new Promise((ok, fail) => {
    if ((window as any).turnstile) return ok();
    let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => ok());
    s.addEventListener("error", () => fail(new Error("captcha")));
  });
}

export default function Captcha({ onToken }: { onToken: (t: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!CAPTCHA_ON) return;
    let id: string | undefined;
    let gone = false;
    loadScript()
      .then(() => {
        const t = (window as any).turnstile as Turnstile;
        if (gone || !box.current) return;
        id = t.render(box.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          language: "sk",
          theme: "dark",
          callback: (v: string) => cb.current(v),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      gone = true;
      if (id) ((window as any).turnstile as Turnstile)?.remove(id);
    };
  }, []);

  return CAPTCHA_ON ? <div ref={box} className="captcha" /> : null;
}
