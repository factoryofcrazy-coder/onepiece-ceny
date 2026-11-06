// Chyby prihlásenia a účtu po slovensky (Supabase ich vracia anglicky).
type AuthErr = { message?: string; code?: string; status?: number } | null | undefined;

const BY_CODE: Record<string, string> = {
  invalid_credentials: "Zlý e-mail alebo heslo.",
  email_not_confirmed: "Najprv potvrď e-mail cez odkaz, ktorý sme ti poslali.",
  user_already_exists: "Účet s týmto e-mailom už existuje. Skús sa prihlásiť.",
  email_exists: "Účet s týmto e-mailom už existuje. Skús sa prihlásiť.",
  weak_password: "Heslo je príliš slabé. Použi aspoň 8 znakov.",
  same_password: "Nové heslo musí byť iné ako to staré.",
  email_address_invalid: "Tento e-mail nevyzerá správne.",
  email_address_not_authorized: "E-mail sa teraz nedá odoslať. Daj nám vedieť cez Report.",
  over_email_send_rate_limit: "Odoslalo sa priveľa e-mailov. Skús to o chvíľu.",
  over_request_rate_limit: "Priveľa pokusov. Skús to o pár minút.",
  request_timeout: "E-mail sa teraz nepodarilo odoslať, skús to neskôr. Ak to nepomôže, napíš nám cez Report.",
  unexpected_failure: "E-mail sa teraz nepodarilo odoslať, skús to neskôr. Ak to nepomôže, napíš nám cez Report.",
  captcha_failed: "Overenie, že nie si robot, zlyhalo. Skús to znova.",
  signup_disabled: "Registrácia je teraz vypnutá.",
  session_not_found: "Prihlásenie vypršalo. Prihlás sa znova.",
};

const BY_CODE_EN: Record<string, string> = {
  invalid_credentials: "Wrong e-mail or password.",
  email_not_confirmed: "First confirm your e-mail using the link we sent you.",
  user_already_exists: "An account with this e-mail already exists. Try signing in.",
  email_exists: "An account with this e-mail already exists. Try signing in.",
  weak_password: "The password is too weak. Use at least 8 characters.",
  same_password: "The new password must be different from the old one.",
  email_address_invalid: "This e-mail doesn't look right.",
  email_address_not_authorized: "The e-mail can't be sent right now. Let us know via Report.",
  over_email_send_rate_limit: "Too many e-mails were sent. Try again in a moment.",
  over_request_rate_limit: "Too many attempts. Try again in a few minutes.",
  request_timeout: "The e-mail couldn't be sent right now, try later. If that doesn't help, write to us via Report.",
  unexpected_failure: "The e-mail couldn't be sent right now, try later. If that doesn't help, write to us via Report.",
  captcha_failed: "The check that you're not a robot failed. Try again.",
  signup_disabled: "Sign-up is currently disabled.",
  session_not_found: "Your session expired. Sign in again.",
};

export function authError(e: AuthErr, lang: "sk" | "en" = "sk"): string {
  if (!e) return "";
  const BY = lang === "en" ? BY_CODE_EN : BY_CODE;
  if (e.code && BY[e.code]) return BY[e.code];
  const m = e.message ?? "";
  if ((e.status ?? 0) >= 500) return BY.request_timeout;
  if (m === "Invalid login credentials") return BY.invalid_credentials;
  if (/already registered/i.test(m)) return BY.user_already_exists;
  if (/rate limit|too many/i.test(m)) return BY.over_request_rate_limit;
  if (/captcha/i.test(m)) return BY.captcha_failed;
  if (/sending .*email|deadline|timeout|gateway/i.test(m)) return BY.request_timeout;
  if (/different from the old/i.test(m)) return BY.same_password;
  if (/failed to fetch|network/i.test(m)) return lang === "en" ? "The server isn't responding. Check your connection and try again." : "Server neodpovedá. Skontroluj pripojenie a skús to znova.";
  return lang === "en" ? "Something went wrong. Try again, and if it doesn't work, write to us via Report." : "Niečo sa nepodarilo. Skús to znova, a ak to nepôjde, napíš nám cez Report.";
}

/** Prezývka: 3–24 znakov, bez @ < >. Vráti text chyby alebo null. */
export function nickError(v: string, lang: "sk" | "en" = "sk"): string | null {
  const s = v.trim();
  const en = lang === "en";
  if (s.length < 3) return en ? "The nickname must have at least 3 characters." : "Prezývka musí mať aspoň 3 znaky.";
  if (s.length > 24) return en ? "The nickname can have at most 24 characters." : "Prezývka môže mať najviac 24 znakov.";
  if (/[@<>]/.test(s)) return en ? "The nickname can't contain @, < or >. Don't use your e-mail in it." : "Prezývka nemôže obsahovať @, < ani >. Nepoužívaj v nej e-mail.";
  return null;
}
