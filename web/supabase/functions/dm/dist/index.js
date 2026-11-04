// lib/dm/crypto.ts
var enc = new TextEncoder();
var dec = new TextDecoder();
var toB64 = (b) => btoa(String.fromCharCode(...b));
var fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function parseKeyRing(raw) {
  const keys = /* @__PURE__ */ new Map();
  for (const part of (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    const version = Number(part.slice(0, i));
    if (i < 1 || !Number.isInteger(version) || version < 1 || version > 32e3) throw new Error("DM_KEYS: neplatn\xE1 verzia k\u013E\xFA\u010Da");
    const key = fromB64(part.slice(i + 1));
    if (key.length !== 32) throw new Error("DM_KEYS: k\u013E\xFA\u010D mus\xED ma\u0165 32 bajtov");
    keys.set(version, key);
  }
  if (!keys.size) throw new Error("DM_KEYS: ch\xFDba k\u013E\xFA\u010D");
  return { current: Math.max(...keys.keys()), keys };
}
async function conversationKey(master, conversationId) {
  const base = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(conversationId), info: enc.encode("grand-line-dm-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
var aadOf = (conversationId, senderId, messageId) => enc.encode(`${conversationId}|${senderId}|${messageId}`);
async function seal(ring, conversationId, senderId, messageId, plain) {
  const key = await conversationKey(ring.keys.get(ring.current), conversationId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadOf(conversationId, senderId, messageId) }, key, enc.encode(plain));
  return { ciphertext: toB64(new Uint8Array(out)), iv: toB64(iv), key_version: ring.current };
}
async function open(ring, conversationId, senderId, messageId, s) {
  const master = ring.keys.get(Number(s.key_version));
  if (!master) throw new Error("ch\xFDba k\u013E\xFA\u010D tejto verzie");
  const key = await conversationKey(master, conversationId);
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(s.iv), additionalData: aadOf(conversationId, senderId, messageId) },
    key,
    fromB64(s.ciphertext)
  );
  return dec.decode(out);
}

// lib/dm/server.ts
var MAX_TEXT = 1e3;
var MAX_REQUEST_BYTES = 16e3;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var CARD_ID = /^[\w.:-]{1,60}$/;
var SEARCH_BATCH = 500;
var SEARCH_BATCHES = 3;
var SEARCH_RESULTS = 50;
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var HttpError = class extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
var uuidOf = (v, what) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, `Neplatn\xE9 ${what}.`);
  return v;
};
var timeOf = (v) => {
  if (v == null) return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new HttpError(400, "Neplatn\xFD \u010Das.");
  return v;
};
function cleanText(v) {
  if (v == null) return "";
  if (typeof v !== "string") throw new HttpError(400, "Neplatn\xFD text spr\xE1vy.");
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").trim();
}
var normalize = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function snippet(text, q) {
  const hit = normalize(text).indexOf(normalize(q));
  const start = Math.max(0, hit - 40);
  const part = text.slice(start, start + 120);
  return (start > 0 ? "\u2026" : "") + part + (start + 120 < text.length ? "\u2026" : "");
}
function createDmHandler(env, deps = {}) {
  let ring = null;
  const keys = () => ring ??= parseKeyRing(env.DM_KEYS);
  const rpc = deps.rpc ?? (async (fn, args) => {
    const r = await fetch(`${env.URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: env.SERVICE,
        ...env.SERVICE.startsWith("ey") ? { Authorization: `Bearer ${env.SERVICE}` } : {},
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args)
    });
    const text = await r.text();
    if (!r.ok) {
      let message = "";
      try {
        message = JSON.parse(text).message ?? "";
      } catch {
      }
      throw new Error(message || `DB ${r.status}`);
    }
    return text ? JSON.parse(text) : null;
  });
  const authUser = deps.authUser ?? (async (authorization) => {
    const r = await fetch(`${env.URL}/auth/v1/user`, { headers: { apikey: env.ANON, Authorization: authorization } });
    if (!r.ok) return null;
    return (await r.json()).id ?? null;
  });
  const unseal = async (m) => {
    try {
      return JSON.parse(await open(keys(), m.conversation_id, m.sender_id, m.id, m));
    } catch {
      return null;
    }
  };
  const present = async (m) => {
    const body = await unseal(m);
    return { id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, created_at: m.created_at, body, unreadable: !body };
  };
  async function bodyOf(b, me) {
    const text = cleanText(b.text);
    if (text.length > MAX_TEXT) throw new HttpError(400, `Spr\xE1va m\xF4\u017Ee ma\u0165 najviac ${MAX_TEXT} znakov.`);
    let card;
    if (b.listingId != null) {
      const l = await rpc("dm_listing", { p_id: uuidOf(b.listingId, "id ponuky") });
      if (!l) throw new HttpError(404, "Ponuka sa nena\u0161la.");
      card = { id: l.card_id, listing: { id: l.id, kind: l.kind, price: l.price == null ? null : Number(l.price), cond: l.cond, lang: l.lang } };
    } else if (b.cardId != null) {
      if (typeof b.cardId !== "string" || !CARD_ID.test(b.cardId)) throw new HttpError(400, "Neplatn\xE1 karta.");
      card = { id: b.cardId };
    }
    if (!text && !card) throw new HttpError(400, "Spr\xE1va je pr\xE1zdna.");
    return card ? { text, card } : { text };
  }
  const ops = {
    async list(me) {
      const rows = await rpc("dm_list", { p_me: me });
      return Promise.all(rows.map(async (c) => ({ ...c, last_message: c.last_message ? await present({ ...c.last_message, conversation_id: c.id }) : null })));
    },
    async open(me, b) {
      return rpc("dm_open", { p_me: me, p_other: uuidOf(b.userId, "id hr\xE1\u010Da") });
    },
    async send(me, b) {
      const id = uuidOf(b.id, "id spr\xE1vy");
      const conv = uuidOf(b.conversationId, "id konverz\xE1cie");
      const body = await bodyOf(b, me);
      const s = await seal(keys(), conv, me, id, JSON.stringify(body));
      const row = await rpc("dm_insert", { p_id: id, p_conv: conv, p_me: me, p_ciphertext: s.ciphertext, p_iv: s.iv, p_key_version: s.key_version });
      if (!row.duplicate && deps.notify) {
        await deps.notify({ recipient: row.recipient, conversationId: conv, senderId: me, isRequest: !!row.is_request, body }).catch(() => console.error("dm: upozornenie zlyhalo"));
      }
      return { id: row.id, created_at: row.created_at, conversation_id: conv, sender_id: me, body, unreadable: false };
    },
    async history(me, b) {
      const rows = await rpc("dm_history", { p_me: me, p_conv: uuidOf(b.conversationId, "id konverz\xE1cie"), p_before: timeOf(b.before), p_limit: 50 });
      return Promise.all(rows.map(present));
    },
    async read(me, b) {
      return rpc("dm_mark_read", { p_me: me, p_conv: uuidOf(b.conversationId, "id konverz\xE1cie") });
    },
    async respond(me, b) {
      return rpc("dm_respond", { p_me: me, p_conv: uuidOf(b.conversationId, "id konverz\xE1cie"), p_accept: b.accept === true });
    },
    async block(me, b) {
      return rpc("dm_block", { p_me: me, p_other: uuidOf(b.userId, "id hr\xE1\u010Da"), p_on: b.on !== false });
    },
    async blocks(me) {
      return rpc("dm_block_list", { p_me: me });
    },
    async find(me, b) {
      const q = cleanText(b.q).slice(0, 40);
      return q.length < 2 ? [] : rpc("dm_find_user", { p_me: me, p_q: q });
    },
    async report(me, b) {
      return rpc("dm_report", { p_me: me, p_message: uuidOf(b.messageId, "id spr\xE1vy"), p_reason: cleanText(b.reason).slice(0, 300) || null });
    },
    async search(me, b) {
      const q = cleanText(b.q);
      if (q.length < 2 || q.length > 60) throw new HttpError(400, "H\u013Eadaj 2 a\u017E 60 znakov.");
      const needle = normalize(q);
      const results = [];
      let before = timeOf(b.before);
      let done = false;
      for (let i = 0; i < SEARCH_BATCHES && results.length < SEARCH_RESULTS && !done; i++) {
        const rows = await rpc("dm_scan", { p_me: me, p_before: before, p_limit: SEARCH_BATCH });
        if (rows.length < SEARCH_BATCH) done = true;
        for (const m of rows) {
          before = m.created_at;
          const body = await unseal(m);
          if (!body) continue;
          const hay = `${body.text ?? ""} ${body.card?.id ?? ""}`;
          if (normalize(hay).includes(needle)) {
            results.push({ id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, created_at: m.created_at, other_name: m.other_name, snippet: snippet(body.text || body.card?.id || "", q) });
            if (results.length >= SEARCH_RESULTS) {
              done = false;
              break;
            }
          }
        }
      }
      return { results, next: done ? null : before };
    },
    async admin_reports(me) {
      const rows = await rpc("dm_admin_reports", { p_me: me });
      return Promise.all(
        rows.map(async (r) => {
          const body = await unseal({ ...r, id: r.message_id });
          return { id: r.id, created_at: r.created_at, message_at: r.message_at, reason: r.reason, sender_id: r.sender_id, sender_name: r.sender_name, reporter_name: r.reporter_name, body, unreadable: !body };
        })
      );
    },
    async admin_resolve(me, b) {
      if (!Number.isSafeInteger(b.id)) throw new HttpError(400, "Neplatn\xE9 hl\xE1senie.");
      return rpc("dm_admin_resolve", { p_me: me, p_id: b.id });
    }
  };
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      if (req.method !== "POST") throw new HttpError(405, "Nepovolen\xE1 met\xF3da.");
      const raw = await req.text();
      if (raw.length > MAX_REQUEST_BYTES) throw new HttpError(413, "Spr\xE1va je prive\u013Ek\xE1.");
      let b;
      try {
        b = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "Neplatn\xE1 po\u017Eiadavka.");
      }
      if (b?.op === "health") {
        keys();
        return json({ ok: true });
      }
      const authorization = req.headers.get("Authorization");
      const me = authorization ? await authUser(authorization) : null;
      if (!me) throw new HttpError(401, "Nie si prihl\xE1sen\xFD.");
      if (typeof b?.op !== "string" || !Object.prototype.hasOwnProperty.call(ops, b.op)) throw new HttpError(400, "Nezn\xE1ma oper\xE1cia.");
      return json({ data: await ops[b.op](me, b) });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const message = String(e?.message ?? "");
      const at = message.indexOf("DM: ");
      if (at >= 0) return json({ error: message.slice(at + 4) }, 400);
      console.error("dm: intern\xE1 chyba", e?.name ?? "");
      return json({ error: "Spr\xE1vy s\xFA do\u010Dasne nedostupn\xE9." }, 500);
    }
  };
}

// supabase/functions/dm/index.ts
var handler = createDmHandler({
  URL: Deno.env.get("SUPABASE_URL"),
  SERVICE: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ANON: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  DM_KEYS: Deno.env.get("DM_KEYS")
});
Deno.serve(handler);
