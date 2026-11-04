// Logika Edge Function "dm". Overí používateľa, skontroluje vstup, zašifruje a rozšifruje text a zavolá databázové
// funkcie dm_*, ktoré strážia pravidlá (členstvo, žiadosti, blokovanie, limity). Text správ sa nikdy nezapisuje do logov.
import { KeyRing, open, parseKeyRing, seal } from "./crypto";
import { allowedEndpoint, PushSub, sendPush, Vapid } from "./push";

export type DmEnv = { URL: string; SERVICE: string; ANON: string; DM_KEYS: string | undefined; VAPID_PUBLIC?: string; VAPID_PRIVATE?: string; VAPID_SUBJECT?: string };
export type DmCard = { id: string; listing?: { id: string; kind: string; price: number | null; cond: string; lang: string } };
export type DmBody = { text: string; card?: DmCard };
export type DmDeps = {
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<any>;
  authUser?: (authorization: string) => Promise<string | null>;
  /** upozornenie príjemcu po uložení správy; chyba nesmie zastaviť odoslanie */
  notify?: (x: DmNotice) => Promise<void>;
  /** odoslanie notifikácie, v testoch sa nahrádza */
  pushFetch?: typeof fetch;
};
export type DmNotice = { recipient: string; conversationId: string; senderId: string; isRequest: boolean; body: DmBody };

export const MAX_TEXT = 1000;
const MAX_REQUEST_BYTES = 16_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CARD_ID = /^[\w.:-]{1,60}$/;
const SEARCH_BATCH = 500;
const SEARCH_BATCHES = 3;
const SEARCH_RESULTS = 50;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const uuidOf = (v: unknown, what: string) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, `Neplatné ${what}.`);
  return v;
};
const timeOf = (v: unknown) => {
  if (v == null) return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new HttpError(400, "Neplatný čas.");
  return v;
};

/** odstráni riadiace znaky okrem nového riadka a tabulátora */
export function cleanText(v: unknown) {
  if (v == null) return "";
  if (typeof v !== "string") throw new HttpError(400, "Neplatný text správy.");
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").trim();
}

/** porovnávanie pri hľadaní: bez diakritiky a veľkých písmen */
export const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function snippet(text: string, q: string) {
  const hit = normalize(text).indexOf(normalize(q));
  const start = Math.max(0, hit - 40);
  const part = text.slice(start, start + 120);
  return (start > 0 ? "…" : "") + part + (start + 120 < text.length ? "…" : "");
}

export function createDmHandler(env: DmEnv, deps: DmDeps = {}) {
  let ring: KeyRing | null = null;
  const keys = () => (ring ??= parseKeyRing(env.DM_KEYS));

  const rpc =
    deps.rpc ??
    (async (fn: string, args: Record<string, unknown>) => {
      const r = await fetch(`${env.URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          apikey: env.SERVICE,
          ...(env.SERVICE.startsWith("ey") ? { Authorization: `Bearer ${env.SERVICE}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
      const text = await r.text();
      if (!r.ok) {
        let message = "";
        try {
          message = JSON.parse(text).message ?? "";
        } catch {
          /* neznáma odpoveď */
        }
        throw new Error(message || `DB ${r.status}`);
      }
      return text ? JSON.parse(text) : null;
    });

  const authUser =
    deps.authUser ??
    (async (authorization: string) => {
      const r = await fetch(`${env.URL}/auth/v1/user`, { headers: { apikey: env.ANON, Authorization: authorization } });
      if (!r.ok) return null;
      return ((await r.json()) as { id?: string }).id ?? null;
    });

  const vapid: Vapid | null = env.VAPID_PUBLIC && env.VAPID_PRIVATE ? { publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT || "https://www.grand-line.eu" } : null;

  const pushNotice = async (x: DmNotice) => {
    if (!vapid) return;
    const t = await rpc("dm_push_targets", { p_recipient: x.recipient, p_sender: x.senderId });
    if (!t.subs.length) return;
    // od cudzieho sa text na zamknutú obrazovku nedostane
    const text = x.isRequest ? "Žiadosť o správu" : !t.show_text ? "Nová správa" : x.body.text || (x.body.card ? `Karta ${x.body.card.id.split("_")[0]}` : "Nová správa");
    const payload = JSON.stringify({ title: t.sender_name, body: text.slice(0, 240), url: `/spravy?c=${x.conversationId}`, tag: `dm-${x.conversationId}`, conversationId: x.conversationId, unread: Number(t.unread) });
    const results = await Promise.all((t.subs as PushSub[]).map((s) => sendPush(s, payload, vapid, deps.pushFetch ?? fetch).catch(() => 0)));
    const gone = (t.subs as PushSub[]).filter((_, i) => results[i] === 404 || results[i] === 410).map((s) => s.endpoint);
    if (gone.length) await rpc("dm_push_forget", { p_endpoints: gone });
  };
  const notify = deps.notify ?? pushNotice;

  const unseal = async (m: any): Promise<DmBody | null> => {
    try {
      return JSON.parse(await open(keys(), m.conversation_id, m.sender_id, m.id, m));
    } catch {
      return null; // poškodená správa nesmie zablokovať zvyšok konverzácie
    }
  };
  const present = async (m: any) => {
    const body = await unseal(m);
    return { id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, created_at: m.created_at, body, unreadable: !body };
  };

  async function bodyOf(b: any, me: string): Promise<DmBody> {
    const text = cleanText(b.text);
    if (text.length > MAX_TEXT) throw new HttpError(400, `Správa môže mať najviac ${MAX_TEXT} znakov.`);
    let card: DmCard | undefined;
    if (b.listingId != null) {
      // cenu a stav ponuky berieme z databázy, nie od odosielateľa
      const l = await rpc("dm_listing", { p_id: uuidOf(b.listingId, "id ponuky") });
      if (!l) throw new HttpError(404, "Ponuka sa nenašla.");
      card = { id: l.card_id, listing: { id: l.id, kind: l.kind, price: l.price == null ? null : Number(l.price), cond: l.cond, lang: l.lang } };
    } else if (b.cardId != null) {
      if (typeof b.cardId !== "string" || !CARD_ID.test(b.cardId)) throw new HttpError(400, "Neplatná karta.");
      card = { id: b.cardId };
    }
    if (!text && !card) throw new HttpError(400, "Správa je prázdna.");
    return card ? { text, card } : { text };
  }

  const ops: Record<string, (me: string, b: any) => Promise<unknown>> = {
    async list(me) {
      const rows = (await rpc("dm_list", { p_me: me })) as any[];
      return Promise.all(rows.map(async (c) => ({ ...c, last_message: c.last_message ? await present({ ...c.last_message, conversation_id: c.id }) : null })));
    },
    async open(me, b) {
      return rpc("dm_open", { p_me: me, p_other: uuidOf(b.userId, "id hráča") });
    },
    async send(me, b) {
      const id = uuidOf(b.id, "id správy");
      const conv = uuidOf(b.conversationId, "id konverzácie");
      const body = await bodyOf(b, me);
      const s = await seal(keys(), conv, me, id, JSON.stringify(body));
      const row = await rpc("dm_insert", { p_id: id, p_conv: conv, p_me: me, p_ciphertext: s.ciphertext, p_iv: s.iv, p_key_version: s.key_version });
      if (!row.duplicate) {
        await notify({ recipient: row.recipient, conversationId: conv, senderId: me, isRequest: !!row.is_request, body }).catch(() => console.error("dm: upozornenie zlyhalo"));
      }
      return { id: row.id, created_at: row.created_at, conversation_id: conv, sender_id: me, body, unreadable: false };
    },
    async history(me, b) {
      const rows = (await rpc("dm_history", { p_me: me, p_conv: uuidOf(b.conversationId, "id konverzácie"), p_before: timeOf(b.before), p_limit: 50 })) as any[];
      return Promise.all(rows.map(present));
    },
    async read(me, b) {
      return rpc("dm_mark_read", { p_me: me, p_conv: uuidOf(b.conversationId, "id konverzácie") });
    },
    async respond(me, b) {
      return rpc("dm_respond", { p_me: me, p_conv: uuidOf(b.conversationId, "id konverzácie"), p_accept: b.accept === true });
    },
    async block(me, b) {
      return rpc("dm_block", { p_me: me, p_other: uuidOf(b.userId, "id hráča"), p_on: b.on !== false });
    },
    async blocks(me) {
      return rpc("dm_block_list", { p_me: me });
    },
    async find(me, b) {
      const q = cleanText(b.q).slice(0, 40);
      return q.length < 2 ? [] : rpc("dm_find_user", { p_me: me, p_q: q });
    },
    async report(me, b) {
      return rpc("dm_report", { p_me: me, p_message: uuidOf(b.messageId, "id správy"), p_reason: cleanText(b.reason).slice(0, 300) || null });
    },
    async search(me, b) {
      const q = cleanText(b.q);
      if (q.length < 2 || q.length > 60) throw new HttpError(400, "Hľadaj 2 až 60 znakov.");
      const needle = normalize(q);
      const results: unknown[] = [];
      let before = timeOf(b.before);
      let done = false;
      for (let i = 0; i < SEARCH_BATCHES && results.length < SEARCH_RESULTS && !done; i++) {
        const rows = (await rpc("dm_scan", { p_me: me, p_before: before, p_limit: SEARCH_BATCH })) as any[];
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
    async push_config() {
      return { publicKey: vapid?.publicKey ?? null };
    },
    async push_subscribe(me, b) {
      if (!allowedEndpoint(b.endpoint)) throw new HttpError(400, "Toto zariadenie sa nedá prihlásiť na notifikácie.");
      if (typeof b.p256dh !== "string" || !/^[\w-]{80,100}$/.test(b.p256dh) || typeof b.auth !== "string" || !/^[\w-]{16,32}$/.test(b.auth)) {
        throw new HttpError(400, "Neplatné údaje zariadenia.");
      }
      return rpc("dm_push_save", { p_me: me, p_endpoint: b.endpoint, p_p256dh: b.p256dh, p_auth: b.auth });
    },
    async push_unsubscribe(me, b) {
      if (typeof b.endpoint !== "string" || b.endpoint.length > 800) throw new HttpError(400, "Neplatné zariadenie.");
      return rpc("dm_push_remove", { p_me: me, p_endpoint: b.endpoint });
    },
    async settings(me) {
      return rpc("dm_settings_get", { p_me: me });
    },
    async settings_set(me, b) {
      return rpc("dm_settings_set", { p_me: me, p_show_text: b.showText !== false });
    },
    async admin_reports(me) {
      const rows = (await rpc("dm_admin_reports", { p_me: me })) as any[];
      return Promise.all(
        rows.map(async (r) => {
          const body = await unseal({ ...r, id: r.message_id });
          return { id: r.id, created_at: r.created_at, message_at: r.message_at, reason: r.reason, sender_id: r.sender_id, sender_name: r.sender_name, reporter_name: r.reporter_name, body, unreadable: !body };
        }),
      );
    },
    async admin_resolve(me, b) {
      if (!Number.isSafeInteger(b.id)) throw new HttpError(400, "Neplatné hlásenie.");
      return rpc("dm_admin_resolve", { p_me: me, p_id: b.id });
    },
  };

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      if (req.method !== "POST") throw new HttpError(405, "Nepovolená metóda.");
      const raw = await req.text();
      if (raw.length > MAX_REQUEST_BYTES) throw new HttpError(413, "Správa je priveľká.");
      let b: any;
      try {
        b = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "Neplatná požiadavka.");
      }
      if (b?.op === "health") {
        keys();
        return json({ ok: true });
      }
      const authorization = req.headers.get("Authorization");
      const me = authorization ? await authUser(authorization) : null;
      if (!me) throw new HttpError(401, "Nie si prihlásený.");
      if (typeof b?.op !== "string" || !Object.prototype.hasOwnProperty.call(ops, b.op)) throw new HttpError(400, "Neznáma operácia.");
      return json({ data: await ops[b.op](me, b) });
    } catch (e: any) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const message = String(e?.message ?? "");
      const at = message.indexOf("DM: ");
      if (at >= 0) return json({ error: message.slice(at + 4) }, 400);
      console.error("dm: interná chyba", e?.name ?? "");
      return json({ error: "Správy sú dočasne nedostupné." }, 500);
    }
  };
}
