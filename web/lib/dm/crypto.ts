// Šifrovanie textu správ vo funkcii "dm" (AES-256-GCM, WebCrypto). Hlavné kľúče sú v tajnej premennej DM_KEYS
// vo formáte "1:base64,2:base64", 32 bajtov každý. Nové správy používajú najvyššiu verziu, staré sa rozšifrujú svojou.
// Pre každú konverzáciu sa kľúč odvodí cez HKDF. Doplnkové dáta (AAD) viažu šifru na konverzáciu, odosielateľa a id správy,
// takže presunutá alebo podvrhnutá správa v databáze neprejde overením.

export type KeyRing = { current: number; keys: Map<number, Uint8Array> };
export type Sealed = { ciphertext: string; iv: string; key_version: number };

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function parseKeyRing(raw: string | undefined): KeyRing {
  const keys = new Map<number, Uint8Array>();
  for (const part of (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    const version = Number(part.slice(0, i));
    if (i < 1 || !Number.isInteger(version) || version < 1 || version > 32000) throw new Error("DM_KEYS: neplatná verzia kľúča");
    const key = fromB64(part.slice(i + 1));
    if (key.length !== 32) throw new Error("DM_KEYS: kľúč musí mať 32 bajtov");
    keys.set(version, key);
  }
  if (!keys.size) throw new Error("DM_KEYS: chýba kľúč");
  return { current: Math.max(...keys.keys()), keys };
}

async function conversationKey(master: Uint8Array, conversationId: string) {
  const base = await crypto.subtle.importKey("raw", master as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(conversationId), info: enc.encode("grand-line-dm-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const aadOf = (conversationId: string, senderId: string, messageId: string) => enc.encode(`${conversationId}|${senderId}|${messageId}`);

export async function seal(ring: KeyRing, conversationId: string, senderId: string, messageId: string, plain: string): Promise<Sealed> {
  const key = await conversationKey(ring.keys.get(ring.current)!, conversationId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadOf(conversationId, senderId, messageId) }, key, enc.encode(plain));
  return { ciphertext: toB64(new Uint8Array(out)), iv: toB64(iv), key_version: ring.current };
}

/** vyhodí chybu, ak je šifra poškodená, kľúč chýba alebo správa nepatrí k týmto údajom */
export async function open(ring: KeyRing, conversationId: string, senderId: string, messageId: string, s: Sealed): Promise<string> {
  const master = ring.keys.get(Number(s.key_version));
  if (!master) throw new Error("chýba kľúč tejto verzie");
  const key = await conversationKey(master, conversationId);
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(s.iv) as BufferSource, additionalData: aadOf(conversationId, senderId, messageId) },
    key,
    fromB64(s.ciphertext) as BufferSource,
  );
  return dec.decode(out);
}
