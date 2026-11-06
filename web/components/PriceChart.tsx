"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "@/lib/data";
import { eur } from "@/lib/data";
import { dayLabel, formatPct, lastDay, niceTicks, priceAt, Series, Step, toSteps, viewOf } from "@/lib/price-series";
import { sb } from "@/lib/supabase";

const RANGES: { label: string; days: number | null }[] = [
  { label: "7 dní", days: 7 },
  { label: "30 dní", days: 30 },
  { label: "Všetko", days: null },
];
const H = 170, LEFT = 58, RIGHT = 10, TOP = 28, BOTTOM = 22;

/** Schodová čiara: cena platí až do ďalšej zmeny. Deň bez ceny čiaru preruší. */
function paths(steps: Step[], to: number, x: (d: number) => number, y: (v: number) => number, floor: number) {
  let line = "", area = "";
  steps.forEach((s, i) => {
    if (s.eur == null) return;
    const x1 = x(s.day), x2 = x(steps[i + 1]?.day ?? to), py = y(s.eur);
    const joined = i > 0 && steps[i - 1].eur != null;
    line += `${joined ? "V" : `M${x1} `}${py} H${x2} `;
    area += `M${x1} ${floor} V${py} H${x2} V${floor} Z `;
  });
  return { line, area };
}

export default function PriceChart({ card, usd, source }: { card: Card; usd: number; source: string }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(480);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    sb()
      .rpc("card_price_series", { p_card: card.id })
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) setFailed(true);
        else setSeries(data as Series);
      });
    return () => {
      live = false;
    };
  }, [card.id]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 480));
    ro.observe(el);
    return () => ro.disconnect();
  }, [series]);

  const steps = useMemo(() => (series ? toSteps(series, card.cm != null, usd) : []), [series, card.cm, usd]);
  const to = series ? lastDay(series, steps) : 0;
  const view = useMemo(() => viewOf(steps, to, RANGES[range].days), [steps, to, range]);

  if (failed) return <section className="pchart"><h3>Vývoj ceny</h3><p className="pchart-sum">Graf sa nepodarilo načítať.</p></section>;
  if (!series) return <section className="pchart" aria-busy="true"><h3>Vývoj ceny</h3><p className="pchart-sum">Načítavam…</p></section>;
  const prices = view ? view.steps.flatMap((s) => (s.eur == null ? [] : [s.eur])) : [];
  if (!view || !prices.length) return <section className="pchart"><h3>Vývoj ceny</h3><p className="pchart-sum">Históriu tejto ceny zatiaľ nemáme.</p></section>;
  if (to - steps[0].day < 1)
    return (
      <section className="pchart">
        <h3>Vývoj ceny</h3>
        <p className="pchart-sum">Cenu tejto karty sledujeme od {dayLabel(steps[0].day)} Graf sa začne kresliť po ďalšom dennom zázname.</p>
      </section>
    );

  const ticks = niceTicks(Math.min(...prices), Math.max(...prices));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const span = Math.max(1, view.to - view.from);
  const x = (d: number) => LEFT + ((d - view.from) / span) * (width - LEFT - RIGHT);
  const y = (v: number) => H - BOTTOM - ((v - lo) / (hi - lo)) * (H - TOP - BOTTOM);
  const { line, area } = paths(view.steps, view.to, x, y, H - BOTTOM);
  const clampDay = (d: number) => Math.min(view.to, Math.max(view.from, d));
  const hoverPrice = hover != null ? priceAt(view.steps, hover) : null;
  const digits = hi < 1 ? 2 : hi - lo < 3 ? 2 : 0;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(clampDay(view.from + Math.round(((e.clientX - r.left - LEFT) / (r.width - LEFT - RIGHT)) * span)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover(clampDay((hover ?? view.to) + (e.key === "ArrowLeft" ? -1 : 1)));
  };
  const summary = `${eur(view.last)}, ${view.pct != null ? formatPct(view.pct) : "bez porovnania"} od ${dayLabel(view.from)}`;

  return (
    <section className="pchart">
      <div className="pchart-head">
        <h3>Vývoj ceny</h3>
        <div className="pchart-range" role="group" aria-label="Obdobie grafu">
          {RANGES.map((r, i) => (
            <button key={r.label} className={i === range ? "on" : ""} aria-pressed={i === range} onClick={() => (setRange(i), setHover(null))}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="pchart-sum">
        {source}: {summary}
      </p>
      <div className="pchart-plot" ref={box}>
        <svg
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={`Vývoj ceny: ${summary}. Šípkami vľavo a vpravo prejdeš po dňoch.`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          onPointerCancel={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="pchart-grid" x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} />
              <text x={LEFT - 6} y={y(t) + 4} textAnchor="end">
                {eur(t, digits)}
              </text>
            </g>
          ))}
          <text x={LEFT} y={H - 5}>{dayLabel(view.from)}</text>
          <text x={width - RIGHT} y={H - 5} textAnchor="end">{dayLabel(view.to)}</text>
          <path className="pchart-area" d={area} />
          <path className="pchart-line" d={line} />
          {hover != null && <line className="pchart-cross" x1={x(hover)} x2={x(hover)} y1={TOP} y2={H - BOTTOM} />}
          {(() => {
            const d = hover ?? view.to, v = hover != null ? hoverPrice : priceAt(view.steps, view.to);
            return v != null ? <circle className="pchart-dot" cx={x(d)} cy={y(v)} r={5} /> : null;
          })()}
        </svg>
        {hover != null && (
          <div className="pchart-tip" style={{ left: Math.min(width - 70, Math.max(70, x(hover))) }} role="status">
            <b>{hoverPrice != null ? eur(hoverPrice) : "bez ceny"}</b>
            <span>{dayLabel(hover)}</span>
          </div>
        )}
      </div>
      <details>
        <summary>Zmeny ceny v tabuľke</summary>
        <table>
          <tbody>
            {[...view.steps].reverse().map((s) => (
              <tr key={s.day}>
                <td>{dayLabel(s.day)}</td>
                <td>{s.eur != null ? eur(s.eur) : "bez ceny"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
