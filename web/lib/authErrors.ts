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

export function authError(e: AuthErr): string {
  if (!e) return "";
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  const m = e.message ?? "";
  if ((e.status ?? 0) >= 500) return BY_CODE.request_timeout;
  if (m === "Invalid login credentials") return BY_CODE.invalid_credentials;
  if (/already registered/i.test(m)) return BY_CODE.user_already_exists;
  if (/rate limit|too many/i.test(m)) return BY_CODE.over_request_rate_limit;
  if (/captcha/i.test(m)) return BY_CODE.captcha_failed;
  if (/sending .*email|deadline|timeout|gateway/i.test(m)) return BY_CODE.request_timeout;
  if (/different from the old/i.test(m)) return BY_CODE.same_password;
  if (/failed to fetch|network/i.test(m)) return "Server neodpovedá. Skontroluj pripojenie a skús to znova.";
  return "Niečo sa nepodarilo. Skús to znova, a ak to nepôjde, napíš nám cez Report.";
}

/** Prezývka: 3–24 znakov, bez @ < >. Vráti text chyby alebo null. */
export function nickError(v: string): string | null {
  const s = v.trim();
  if (s.length < 3) return "Prezývka musí mať aspoň 3 znaky.";
  if (s.length > 24) return "Prezývka môže mať najviac 24 znakov.";
  if (/[@<>]/.test(s)) return "Prezývka nemôže obsahovať @, < ani >. Nepoužívaj v nej e-mail.";
  return null;
}
