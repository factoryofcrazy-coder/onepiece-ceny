"use client";
// Ranky podľa ELO a levely podľa XP. XP počíta databáza (migrácia 20261109), tu sa len zobrazujú.
import { useEffect, useState } from "react";
import { sb } from "./supabase";

export type Rank = { id: string; name: string; min: number; color: string; icon: string };

// stred = štartovné ELO 1000; prvý zápas človeka zaradí medzi Námorníkov alebo Pirátov
export const RANKS: Rank[] = [
  { id: "sailor", name: "Námorník", min: 0, color: "#9db2c7", icon: "M12 3a2 2 0 0 1 1 3.7V9h3v2h-3v8.4a6 6 0 0 0 5-4.4h-2l3-4 3 4h-2a9 9 0 0 1-17 0H2l3-4 3 4H6a6 6 0 0 0 5 4.4V11H8V9h3V6.7A2 2 0 0 1 12 3Z" },
  { id: "pirate", name: "Pirát", min: 1000, color: "#7fd69a", icon: "M4 3l7.5 7.5-2 2L2 5V3h2Zm16 0h2v2L10.8 16.2l1.5 1.5-1.4 1.4-2.2-2.2-3.3 3.3-1.4-1.4 3.3-3.3-2.2-2.2 1.4-1.4 1.5 1.5L20 3Zm-5.7 11.4 2-2 .9.9 2.8-2.8 1.4 1.4-2.8 2.8.9.9-2 2-3.2-3.2Z" },
  { id: "captain", name: "Kapitán", min: 1100, color: "#5ec8c8", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 2.1a8 8 0 0 1 3.9 1.6l-2.3 2.3a5 5 0 0 0-1.6-.7V4.1Zm-2 0v3.2a5 5 0 0 0-1.6.7L7.1 5.7A8 8 0 0 1 11 4.1ZM5.7 7.1 8 9.4a5 5 0 0 0-.7 1.6H4.1a8 8 0 0 1 1.6-3.9ZM4.1 13h3.2a5 5 0 0 0 .7 1.6l-2.3 2.3A8 8 0 0 1 4.1 13Zm3 5.3 2.3-2.3a5 5 0 0 0 1.6.7v3.2a8 8 0 0 1-3.9-1.6Zm5.9 1.6v-3.2a5 5 0 0 0 1.6-.7l2.3 2.3a8 8 0 0 1-3.9 1.6Zm5.3-3-2.3-2.3a5 5 0 0 0 .7-1.6h3.2a8 8 0 0 1-1.6 3.9ZM16.7 11a5 5 0 0 0-.7-1.6l2.3-2.3a8 8 0 0 1 1.6 3.9h-3.2ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" },
  { id: "supernova", name: "Supernova", min: 1200, color: "#b48cf2", icon: "M12 1l2 7 5-4-3 6 7 2-7 2 3 6-5-4-2 7-2-7-5 4 3-6-7-2 7-2-3-6 5 4 2-7Z" },
  { id: "warlord", name: "Warlord", min: 1300, color: "#7ea6ff", icon: "M12 2l8 3v6c0 5.2-3.3 9.2-8 11-4.7-1.8-8-5.8-8-11V5l8-3Zm0 4-1.5 3.6L7 10l2.7 2.3L8.9 16l3.1-2 3.1 2-.8-3.7L17 10l-3.5-.4L12 6Z" },
  { id: "yonko", name: "Yonko", min: 1450, color: "#ff7a85", icon: "M12 1l3 7 7 4-7 4-3 7-3-7-7-4 7-4 3-7Zm0 7.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.500Z" },
  { id: "king", name: "Kráľ pirátov", min: 1600, color: "#f2b84b", icon: "M3 7l5 4 4-7 4 7 5-4-2 12H5L3 7Zm3 14h12v2H6v-2Z" },
];

export const rankOf = (elo: number) => [...RANKS].reverse().find((r) => elo >= r.min) ?? RANKS[0];
export const rankIndex = (elo: number) => RANKS.indexOf(rankOf(elo));

/** Level n vyžaduje 25·n·(n−1) XP: 2 → 50, 3 → 150, 5 → 500, 10 → 2 250. */
export const xpForLevel = (level: number) => 25 * level * (level - 1);
export const levelOf = (xp: number) => {
  let l = 1;
  while (xpForLevel(l + 1) <= xp) l++;
  return l;
};
export function levelProgress(xp: number) {
  const level = levelOf(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, have: xp - from, need: to - from, toNext: to - xp, pct: Math.round(((xp - from) / (to - from)) * 100) };
}

export const XP_SOURCES: { id: string; label: string; hint: string; cap: number }[] = [
  { id: "daily", label: "Denná návšteva", hint: "10 XP za deň", cap: 10 },
  { id: "chat", label: "Chat", hint: "2 XP za správu, najviac raz za 20 s", cap: 30 },
  { id: "game", label: "Online hra", hint: "20 XP za dohranú hru", cap: 100 },
  { id: "training", label: "Tréning s botom", hint: "5 XP, Stredný alebo Ťažký bot", cap: 25 },
  { id: "collection", label: "Zbierka", hint: "2 XP za pridanie kariet", cap: 20 },
  { id: "trade", label: "Trhovisko", hint: "5 XP za ponuku", cap: 15 },
  { id: "report", label: "Report", hint: "5 XP za hlásenie", cap: 10 },
];

/** Oznámi obrazovkám, že sa zmenili XP (napr. databáza práve pripísala dennú návštevu). */
const XP_EVENT = "gl-xp-changed";
export const notifyXp = () => window.dispatchEvent(new Event(XP_EVENT));
export const onXpChanged = (fn: () => void) => {
  window.addEventListener(XP_EVENT, fn);
  return () => window.removeEventListener(XP_EVENT, fn);
};

export type Badge = { elo: number; games: number; xp: number };
let cache: { at: number; map: Promise<Map<string, Badge>> } | null = null;

export function loadBadges(force = false) {
  if (!force && cache && Date.now() - cache.at < 60000) return cache.map;
  const map = Promise.all([sb().from("ratings").select("user_id, elo, games").limit(2000), sb().from("user_xp").select("user_id, xp").limit(2000)]).then(([r, x]) => {
    const m = new Map<string, Badge>();
    for (const a of (r.data as any[]) ?? []) m.set(a.user_id, { elo: a.elo, games: a.games, xp: 0 });
    for (const a of (x.data as any[]) ?? []) m.set(a.user_id, { ...(m.get(a.user_id) ?? { elo: 1000, games: 0 }), xp: a.xp });
    return m;
  });
  cache = { at: Date.now(), map };
  return map;
}

export function useBadges(enabled = true) {
  const [map, setMap] = useState<Map<string, Badge>>(new Map());
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadBadges().then((m) => live && setMap(m));
    return () => {
      live = false;
    };
  }, [enabled]);
  return map;
}

export function RankIcon({ rank, size = 16 }: { rank: Rank; size?: number }) {
  return (
    <svg className="rk-ic" viewBox="0 0 24 24" width={size} height={size} fill={rank.color} role="img" aria-label={rank.name}>
      <title>{rank.name}</title>
      <path fillRule="evenodd" d={rank.icon} />
    </svg>
  );
}

/** Odznak pri mene: rank (po prvej hodnotenej hre) a level. */
export function UserBadge({ badge, compact = false }: { badge?: Badge; compact?: boolean }) {
  if (!badge) return null;
  const level = levelOf(badge.xp);
  const rank = badge.games > 0 ? rankOf(badge.elo) : null;
  return (
    <span className="rk-badge" title={`${rank ? rank.name + " · " : ""}Level ${level}`}>
      {rank && <RankIcon rank={rank} size={14} />}
      {rank && !compact && <span className="rk-name" style={{ color: rank.color }}>{rank.name}</span>}
      <span className="rk-lv">Lv {level}</span>
    </span>
  );
}
