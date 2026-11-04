import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { allowedEndpoint, b64u, encryptPayload, sendPush, unb64u, vapidAuthorization } from "./push";

// príjemca, ako ho má prehliadač
const ua = createECDH("prime256v1");
ua.generateKeys();
const secret = new Uint8Array(16).fill(9);
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64u(new Uint8Array(ua.getPublicKey())), auth: b64u(secret) };

/** nezávislé rozšifrovanie podľa RFC 8291 cez node:crypto */
function decrypt(data: Uint8Array) {
  const b = Buffer.from(data);
  const salt = b.subarray(0, 16);
  const idlen = b[20];
  const asPublic = b.subarray(21, 21 + idlen);
  const body = b.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, secret, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(body.subarray(body.length - 16));
  const out = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  expect(out[out.length - 1]).toBe(2);
  return out.subarray(0, out.length - 1).toString("utf8");
}

const srv = createECDH("prime256v1");
srv.generateKeys();
const vapid = { publicKey: srv.getPublicKey().toString("base64url"), privateKey: srv.getPrivateKey().toString("base64url"), subject: "https://www.grand-line.eu" };

describe("Web Push", () => {
  it("obsah sa dá rozšifrovať podľa RFC 8291 a v šifre nie je čitateľný", async () => {
    const text = JSON.stringify({ title: "Hawk", body: "Áno, poštou 🏴‍☠️" });
    const data = await encryptPayload(text, sub);
    expect(decrypt(data)).toBe(text);
    expect(Buffer.from(data).toString("utf8")).not.toContain("poštou");
    expect(data.length).toBeLessThan(4096);
  });
  it("VAPID podpis platí pre adresu služby a neobsahuje osobný kontakt", async () => {
    const h = await vapidAuthorization(sub.endpoint, vapid, 1000);
    const [, jwt, key] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(key).toBe(vapid.publicKey);
    const [head, claims, sig] = jwt.split(".");
    const c = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(c).toEqual({ aud: "https://fcm.googleapis.com", exp: 1000 + 12 * 3600, sub: "https://www.grand-line.eu" });
    const pub = unb64u(vapid.publicKey);
    const pk = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) } });
    expect(verify("sha256", Buffer.from(`${head}.${claims}`), { key: pk, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });
  it.each([
    ["https://fcm.googleapis.com/fcm/send/x", true],
    ["https://web.push.apple.com/abc", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://db5.notify.windows.com/w/?t=x", true],
    ["http://fcm.googleapis.com/x", false],
    ["https://fcm.googleapis.com.zly.sk/x", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["https://x@fcm.googleapis.com/x", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["https://localhost/x", false],
    ["https://wpmarrzqzcfugtfjitot.supabase.co/rest/v1/", false],
    [5, false],
  ])("adresa %s povolená: %s", (u, ok) => {
    expect(allowedEndpoint(u)).toBe(ok);
  });
  it("na cudziu adresu nič nepošle a presmerovanie nesleduje", async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await sendPush({ ...sub, endpoint: "https://zly.sk/x" }, "x", vapid, f as any)).toBe(410);
    expect(f).not.toHaveBeenCalled();
    expect(await sendPush(sub, "x", vapid, f as any)).toBe(201);
    expect((f.mock.calls[0] as any[])[1].redirect).toBe("error");
  });
});

describe("service worker", () => {
  const load = (windows: any[] = []) => {
    const on: Record<string, (e: any) => void> = {};
    const shown: any[] = [];
    const opened: string[] = [];
    const self: any = {
      addEventListener: (n: string, f: any) => (on[n] = f),
      clients: { matchAll: async () => windows, openWindow: async (u: string) => opened.push(u) },
      registration: { showNotification: async (t: string, o: any) => shown.push({ t, ...o }) },
      location: { origin: "https://www.grand-line.eu" },
    };
    new Function("self", readFileSync("public/sw.js", "utf8"))(self);
    const fire = async (name: string, e: any) => {
      let done: Promise<unknown> = Promise.resolve();
      on[name]({ ...e, waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
    };
    return { fire, shown, opened };
  };
  const push = (d: unknown) => ({ data: { json: () => d } });

  it("ukáže meno a text a po kliknutí otvorí konverzáciu", async () => {
    const w = load();
    await w.fire("push", push({ title: "Hawk", body: "Ahoj", url: "/spravy?c=1", tag: "dm-1", conversationId: "1" }));
    expect(w.shown[0]).toMatchObject({ t: "Hawk", body: "Ahoj", tag: "dm-1" });
    await w.fire("notificationclick", { notification: { close() {}, data: w.shown[0].data } });
    expect(w.opened).toEqual(["/spravy?c=1"]);
  });
  it("nič neukáže, keď je konverzácia otvorená pred očami, inú áno", async () => {
    const w = load([{ focused: true, url: "https://www.grand-line.eu/spravy?c=1" }]);
    await w.fire("push", push({ title: "H", body: "x", conversationId: "1" }));
    expect(w.shown).toHaveLength(0);
    await w.fire("push", push({ title: "H", body: "x", conversationId: "2" }));
    expect(w.shown).toHaveLength(1);
  });
  it("cudziu adresu v notifikácii neotvorí a pokazený obsah zvládne", async () => {
    const w = load();
    await w.fire("push", { data: { json: () => { throw new Error("x"); } } });
    expect(w.shown[0].t).toBe("Grand Line");
    await w.fire("notificationclick", { notification: { close() {}, data: { url: "https://zly.sk" } } });
    expect(w.opened).toEqual(["/spravy"]);
  });
  it("neukladá nič do cache", () => {
    expect(readFileSync("public/sw.js", "utf8")).not.toMatch(/addEventListener\("fetch"|caches\./);
  });
});
