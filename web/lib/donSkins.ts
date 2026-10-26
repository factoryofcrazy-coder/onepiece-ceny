"use client";
// DON!! skiny: vzhľad mojich DON!! žetónov na hracej ploche. Odomykajú sa hraním –
// výhry proti botovi a odohrané hry sa počítajú v prehliadači, online výhry a hry sa berú z rebríčka.
import { useCallback, useEffect, useState } from "react";

export type DonStats = { botGames: number; botWins: number; onlineGames: number; onlineWins: number };
type Rule = { kind: "free" } | { kind: "botWins" | "games" | "onlineWins"; n: number };
export type DonSkin = { id: string; name: string; img: string | null; rule: Rule };

export const DON_SKINS: DonSkin[] = [
  { id: "classic", name: "Klasický", img: null, rule: { kind: "free" } },
  { id: "ancient_map", name: "Stará mapa", img: "/game/don/ancient_map.webp", rule: { kind: "free" } },
  { id: "blue_wave", name: "Veľká vlna", img: "/game/don/blue_wave.webp", rule: { kind: "botWins", n: 1 } },
  { id: "clear_sky", name: "Jasná obloha", img: "/game/don/clear_sky.webp", rule: { kind: "botWins", n: 3 } },
  { id: "teal_ocean", name: "Tyrkysový oceán", img: "/game/don/teal_ocean.webp", rule: { kind: "botWins", n: 5 } },
  { id: "wood_grain", name: "Drevená paluba", img: "/game/don/wood_grain.webp", rule: { kind: "botWins", n: 10 } },
  { id: "monochrome", name: "Čiernobiely", img: "/game/don/monochrome.webp", rule: { kind: "games", n: 5 } },
  { id: "moonlight", name: "Mesačný svit", img: "/game/don/moonlight.webp", rule: { kind: "games", n: 15 } },
  { id: "sakura", name: "Sakura", img: "/game/don/sakura.webp", rule: { kind: "games", n: 30 } },
  { id: "sunset_ship", name: "Západ slnka", img: "/game/don/sunset_ship.webp", rule: { kind: "onlineWins", n: 1 } },
  { id: "crimson_storm", name: "Karmínová búrka", img: "/game/don/crimson_storm.webp", rule: { kind: "onlineWins", n: 3 } },
  { id: "golden_flame", name: "Zlatý plameň", img: "/game/don/golden_flame.webp", rule: { kind: "onlineWins", n: 5 } },
  { id: "black_gold", name: "Čierne zlato", img: "/game/don/black_gold.webp", rule: { kind: "onlineWins", n: 10 } },
];

const STATS_KEY = "op-don-stats";
const SKIN_KEY = "op-don-skin";
const ONLINE_KEY = "op-don-online"; // posledné známe online čísla z rebríčka
const EVT = "op-don-change";

export const emptyStats = (): DonStats => ({ botGames: 0, botWins: 0, onlineGames: 0, onlineWins: 0 });

/** hodnota, podľa ktorej sa pravidlo posudzuje */
export function progressOf(rule: Rule, st: DonStats): { have: number; need: number } {
  if (rule.kind === "free") return { have: 1, need: 1 };
  const have = rule.kind === "botWins" ? st.botWins : rule.kind === "onlineWins" ? st.onlineWins : st.botGames + st.onlineGames;
  return { have, need: rule.n };
}
export const isUnlocked = (skin: DonSkin, st: DonStats) => {
  const p = progressOf(skin.rule, st);
  return p.have >= p.need;
};
export function ruleText(rule: Rule): string {
  if (rule.kind === "free") return "Odomknutý";
  const n = rule.n;
  const pl = (one: string, few: string, many: string) => (n === 1 ? one : n < 5 ? few : many);
  if (rule.kind === "botWins") return `${n} ${pl("výhra", "výhry", "výhier")} proti botovi`;
  if (rule.kind === "onlineWins") return `${n} ${pl("online výhra", "online výhry", "online výhier")}`;
  return `${n} ${pl("odohraná hra", "odohrané hry", "odohraných hier")}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* bez úložiska */
  }
}

/** bot štatistiky z prehliadača + posledné známe online čísla z rebríčka */
export function readLocalStats(): DonStats {
  return { ...emptyStats(), ...read<Partial<DonStats>>(ONLINE_KEY, {}), ...read<Partial<DonStats>>(STATS_KEY, {}) };
}

/** uloží online čísla z rebríčka (lobby ich načíta pre prihláseného hráča) */
export function cacheOnlineStats(onlineGames: number, onlineWins: number) {
  const cur = read<Partial<DonStats>>(ONLINE_KEY, {});
  if (cur.onlineGames === onlineGames && cur.onlineWins === onlineWins) return;
  write(ONLINE_KEY, { onlineGames, onlineWins });
}

/** zapíše dohranú hru proti botovi; vráti skiny, ktoré sa práve odomkli */
export function recordBotGame(won: boolean): DonSkin[] {
  const before = readLocalStats();
  const after = { ...before, botGames: before.botGames + 1, botWins: before.botWins + (won ? 1 : 0) };
  write(STATS_KEY, { botGames: after.botGames, botWins: after.botWins });
  return DON_SKINS.filter((k) => !isUnlocked(k, before) && isUnlocked(k, after));
}

export function readSkinId(): string {
  return read<string>(SKIN_KEY, "classic");
}

/** zvolený skin + zmena; počúva aj zmeny z iných kariet prehliadača */
export function useDonSkin() {
  const [id, setId] = useState("classic");
  useEffect(() => {
    const sync = () => setId(readSkinId());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const choose = useCallback((next: string) => write(SKIN_KEY, next), []);
  const skin = DON_SKINS.find((k) => k.id === id) ?? DON_SKINS[0];
  return { skin, choose };
}

/** lokálne štatistiky ako stav (obnoví sa po každej hre) */
export function useLocalDonStats() {
  const [st, setSt] = useState<DonStats>(emptyStats);
  useEffect(() => {
    const sync = () => setSt(readLocalStats());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return st;
}
