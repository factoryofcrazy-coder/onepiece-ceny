import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const subscribe = vi.fn(async () => ({ endpoint: "https://fcm.googleapis.com/x", toJSON: () => ({ keys: { p256dh: "a", auth: "b" } }) }));

vi.mock("../supabase", () => ({ sb: () => ({}) }));
vi.mock("./push-call", () => ({
  dmPushCall: vi.fn(async (op: string) => {
    calls.push(op);
    return op === "push_config" ? { publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" } : { ok: true };
  }),
}));

import { enablePush } from "./push-client";

function browser(answer: NotificationPermission) {
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn(async () => {
      calls.push("povolenie");
      return answer;
    }),
  });
  const reg = { pushManager: { subscribe } };
  vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn(async () => reg), ready: Promise.resolve(reg) } });
}

describe("zapnutie notifikácií", () => {
  beforeEach(() => {
    calls.length = 0;
    subscribe.mockClear();
  });
  it("pýta povolenie skôr ako čaká na server, inak ho telefón zamietne", async () => {
    browser("granted");
    await enablePush();
    expect(calls).toEqual(["povolenie", "push_config", "push_subscribe"]);
    expect(subscribe).toHaveBeenCalledOnce();
  });
  it("pri zamietnutí nič neprihlási a povie, čo robiť", async () => {
    browser("denied");
    await expect(enablePush()).rejects.toThrow("zablokované");
    expect(calls).toEqual(["povolenie"]);
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("pri zavretom okne povie, že to treba skúsiť znova", async () => {
    browser("default");
    await expect(enablePush()).rejects.toThrow("Skús to znova");
    expect(calls).toEqual(["povolenie"]);
  });
});
