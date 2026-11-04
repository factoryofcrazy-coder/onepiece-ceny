// Web Push bez knižnice: šifrovanie obsahu podľa RFC 8291 (aes128gcm) a prihlásenie servera VAPID (RFC 8292), len WebCrypto.
// Notifikačná služba (Google, Apple, Mozilla) vidí iba šifrovaný obsah, otvoriť ho vie len zariadenie.
export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };

const enc = new TextEncoder();

export const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** server smie posielať len známym notifikačným službám, nie na ľubovoľnú adresu od klienta */
export function allowedEndpoint(v: unknown) {
  if (typeof v !== "string" || v.length > 800) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  const h = u.hostname;
  return (
    h === "fcm.googleapis.com" ||
    h === "web.push.apple.com" ||
    h === "updates.push.services.mozilla.com" ||
    h.endsWith(".push.apple.com") ||
    h.endsWith(".push.services.mozilla.com") ||
    h.endsWith(".notify.windows.com")
  );
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8));
}

export async function encryptPayload(plain: string, sub: Pick<PushSub, "p256dh" | "auth">) {
  const uaPublic = unb64u(sub.p256dh);
  const secret = unb64u(sub.auth);
  const ua = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, as.privateKey, 256));
  const ikm = await hkdf(secret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, concat(enc.encode(plain), new Uint8Array([2])) as BufferSource));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

export async function vapidAuthorization(endpoint: string, v: Vapid, nowSeconds = Math.floor(Date.now() / 1000)) {
  const pub = unb64u(v.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: v.privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const part = (o: unknown) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: v.subject })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`;
}

/** vráti stavový kód služby; 404 a 410 znamenajú neplatné zariadenie */
export async function sendPush(sub: PushSub, plain: string, v: Vapid, doFetch: typeof fetch = fetch) {
  if (!allowedEndpoint(sub.endpoint)) return 410;
  const r = await doFetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, v),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: (await encryptPayload(plain, sub)) as BodyInit,
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  return r.status;
}
