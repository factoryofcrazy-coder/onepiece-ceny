// Rozdelenie textu na obyčajné časti a webové odkazy. Text správy sa vždy vykresľuje ako text, nikdy ako HTML.
export type TextPart = { t: "text" | "link"; v: string };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAIL = /[.,;:!?)\]]+$/;

export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAIL, "");
    const start = m.index ?? 0;
    if (start > at) out.push({ t: "text", v: text.slice(at, start) });
    out.push({ t: "link", v: url });
    at = start + url.length;
  }
  if (at < text.length) out.push({ t: "text", v: text.slice(at) });
  return out;
}

export const hasLink = (text: string) => splitLinks(text).some((p) => p.t === "link");

export function fmtDmTime(ts: string, now = new Date()) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}

export function fmtDmDay(ts: string, now = new Date()) {
  const d = new Date(ts);
  if (d.toDateString() === now.toDateString()) return "Dnes";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Včera";
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function previewOf(body: { text?: string; card?: { id: string } } | null | undefined) {
  if (!body) return "Správu sa nepodarilo načítať";
  if (body.text) return body.text;
  return body.card ? `Karta ${body.card.id.split("_")[0]}` : "";
}
