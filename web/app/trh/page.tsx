"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loading } from "@/components/ui";
import { indexed, IndexPoint, lastSpyDay, loadMarketIndex, loadSpy, spyAligned, SpyPoint } from "@/lib/market";
import MarketTabs from "@/components/MarketTabs";
import { useLang } from "@/lib/lang";

const H = 230, LEFT = 48, RIGHT = 16, TOP = 16, BOT = 28;
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" });
const pctTxt = (raw: number) => {
  const v = Math.abs(raw) < 0.05 ? 0 : raw;
  return v > 0 ? `▲ ${v.toLocaleString("sk-SK", { maximumFractionDigits: 1 })} %` : v < 0 ? `▼ ${(-v).toLocaleString("sk-SK", { maximumFractionDigits: 1 })} %` : "±0 %";
};
const num = (v: number) => Math.round(v).toLocaleString("sk-SK");
// pekné hodnoty osi Y
function ticksOf(min: number, max: number): number[] {
  const raw = (max - min) / 3 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) ?? mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1e4) / 1e4);
  return out;
}

export default function Page() {
  const [points, setPoints] = useState<IndexPoint[] | null>(null);
  const [spy, setSpy] = useState<SpyPoint[]>([]);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(680);
  const box = useRef<HTMLDivElement>(null);
  const { t, locale } = useLang();

  useEffect(() => {
    loadMarketIndex().then(setPoints);
    loadSpy().then(setSpy);
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [table, points]);

  const idx = useMemo(() => (points ? indexed(points) : []), [points]);
  const spyIdx = useMemo(() => spyAligned(idx.map((p) => p.day), spy), [idx, spy]);
  const hasSpy = spyIdx.some((v) => v != null);

  if (points === null) return <Loading shape="rows" />;

  const latest = idx[idx.length - 1];
  const prev = idx[idx.length - 2];
  const pctDay = prev ? (latest.idx / prev.idx - 1) * 100 : null;
  const pctAll = latest ? (latest.idx / 1000 - 1) * 100 : null;
  const spyLast = [...spyIdx].reverse().find((v) => v != null) ?? null;
  const spyAll = spyLast != null ? spyLast / 10 - 100 : null;
  // burza cez víkend a sviatky nehandluje – vtedy ukáž, z ktorého dňa je posledný kurz
  const spyDay = latest ? lastSpyDay(spy, latest.day) : null;
  const spyStale = !!spyDay && !!latest && spyDay < latest.day;
  const spyDayTxt = spyDay ? new Date(spyDay + "T12:00:00").toLocaleDateString(locale, { day: "numeric", month: locale.startsWith("en") ? "short" : "numeric" }) : "";

  // os
  const all = [...idx.map((p) => p.idx), ...spyIdx.filter((v): v is number => v != null), 1000];
  const lo0 = Math.min(...all), hi0 = Math.max(...all);
  const pad = Math.max((hi0 - lo0) * 0.15, 20);
  const yt = ticksOf(lo0 - pad, hi0 + pad);
  const y0 = Math.min(lo0 - pad, ...yt), y1 = Math.max(hi0 + pad, ...yt);
  const x = (i: number) => LEFT + (idx.length <= 1 ? 0 : (i / (idx.length - 1)) * (width - LEFT - RIGHT));
  const y = (v: number) => TOP + (1 - (v - y0) / (y1 - y0)) * (H - TOP - BOT);
  const line = idx.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.idx).toFixed(1)}`).join(" ");
  const area = idx.length > 1 ? `${line} L${x(idx.length - 1).toFixed(1)} ${(H - BOT).toFixed(1)} L${x(0).toFixed(1)} ${(H - BOT).toFixed(1)} Z` : "";
  const spyLine = spyIdx.map((v, i) => (v == null ? "" : `${i && spyIdx[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(" ");
  const xStep = Math.max(1, Math.ceil(idx.length / 5));

  const clampI = (i: number) => Math.min(idx.length - 1, Math.max(0, i));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left - LEFT) / (r.width - LEFT - RIGHT);
    setHover(clampI(Math.round(frac * (idx.length - 1))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover(clampI((hover ?? idx.length - 1) + (e.key === "ArrowLeft" ? -1 : 1)));
  };
  const hv = hover != null ? idx[hover] : null;
  const hvSpy = hover != null ? spyIdx[hover] : null;

  return (
    <div className="mindex">
      <MarketTabs />
      <h1>{t("Trhový index", "Market index")}</h1>
      <p className="muted small">
        {t("Vývoj celého trhu One Piece podľa priemernej trend ceny kariet (od 1 €) a boxov na Cardmarkete, porovnaný s akciovým trhom (SPY, teda S&P 500). Základ 1000 je prvý zaznamenaný deň.", "The whole One Piece market based on the average Cardmarket trend price of cards (from €1) and boxes, compared with the stock market (SPY, i.e. the S&P 500). The base of 1000 is the first recorded day.")}
      </p>

      {latest ? (
        <>
          <div className="mindex-big">
            <b>{num(latest.idx)}</b>
            {pctDay != null && <span className={`cmove ${pctDay > 0 ? "up" : pctDay < 0 ? "down" : ""}`}>{pctTxt(pctDay)} {t("za deň", "today")}</span>}
          </div>
          <p className="muted small">
            {pctAll != null && (
              <>
                {t("Od začiatku", "Since start")} <span className={pctAll > 0 ? "cmove up" : pctAll < 0 ? "cmove down" : ""}>{pctTxt(pctAll)}</span>.{" "}
              </>
            )}
            {t("Kôš", "Basket")}: {latest.items.toLocaleString("sk-SK")} {t("položiek", "items")}.
          </p>

          {pctAll != null && spyAll != null && (
            <p className="mindex-verdict">
              {t("Za toto obdobie", "Over this period")} {Math.abs(pctAll - spyAll) < 0.1 ? t("išli rovnako", "both moved the same") : pctAll > spyAll ? t("si lepšie viedol One Piece", "One Piece did better") : t("si lepšie viedli akcie", "stocks did better")}:{" "}
              <b className="op">One Piece {pctTxt(pctAll)}</b> vs <b className="spy">SPY {pctTxt(spyAll)}</b>
              {spyStale && <span className="muted small"> ({t(`kurz z ${spyDayTxt}, burza cez víkend a sviatky nehandluje`, `price from ${spyDayTxt}, the stock market is closed on weekends and holidays`)})</span>}.
            </p>
          )}

          {idx.length >= 2 ? (
            table ? (
              <table className="graded-table mindex-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Deň", "Day")}</th>
                    <th scope="col">One Piece</th>
                    {hasSpy && <th scope="col">SPY</th>}
                  </tr>
                </thead>
                <tbody>
                  {idx
                    .map((p, i) => ({ p, s: spyIdx[i] }))
                    .reverse()
                    .map(({ p, s }) => (
                      <tr key={p.day}>
                        <th scope="row">{dayLabel(p.day)}</th>
                        <td>{num(p.idx)}</td>
                        {hasSpy && <td>{s != null ? num(s) : "–"}</td>}
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <>
                <div className="mindex-legend">
                  <span className="op">One Piece</span>
                  {hasSpy && <span className="spy">SPY (S&amp;P 500)</span>}
                </div>
                <div className="pchart mindex-chart" ref={box}>
                  <svg
                    viewBox={`0 0 ${width} ${H}`}
                    role="img"
                    tabIndex={0}
                    aria-label={`${t("Trhový index", "Market index")} ${num(latest.idx)}${spyLast != null ? `, SPY ${num(spyLast)}` : ""}. ${t("Šípkami prejdeš po dňoch.", "Use arrow keys to move between days.")}`}
                    onPointerMove={onMove}
                    onPointerDown={onMove}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                    onKeyDown={onKey}
                    onBlur={() => setHover(null)}
                  >
                    {yt.map((t) => (
                      <g key={t}>
                        <line x1={LEFT} y1={y(t)} x2={width - RIGHT} y2={y(t)} className={t === 1000 ? "mindex-base" : "mindex-grid"} />
                        <text x={LEFT - 8} y={y(t) + 3.5} textAnchor="end" className="mindex-ax">
                          {num(t)}
                        </text>
                      </g>
                    ))}
                    {area && <path d={area} className="mindex-area" />}
                    {hasSpy && spyLine && <path d={spyLine} className="mindex-spy" fill="none" />}
                    <path d={line} className="mindex-line" fill="none" />
                    {idx.map((p, i) => (i % xStep === 0 || i === idx.length - 1 ? (
                      <text key={p.day} x={x(i)} y={H - 9} textAnchor={i === 0 ? "start" : i === idx.length - 1 ? "end" : "middle"} className="mindex-ax">
                        {dayLabel(p.day)}
                      </text>
                    ) : null))}
                    {hover != null && hv && (
                      <>
                        <line x1={x(hover)} y1={TOP} x2={x(hover)} y2={H - BOT} className="mindex-cross" />
                        {hvSpy != null && <circle cx={x(hover)} cy={y(hvSpy)} r={4} className="mindex-dot spy" />}
                        <circle cx={x(hover)} cy={y(hv.idx)} r={4.5} className="mindex-dot" />
                      </>
                    )}
                  </svg>
                  {hover != null && hv && (
                    <div className="mindex-tip" style={{ left: Math.min(width - 86, Math.max(86, x(hover))) }} role="status">
                      <span className="mindex-tip-day">{dayLabel(hv.day)}</span>
                      <span className="mindex-tip-row op">
                        <i /> <b>{num(hv.idx)}</b> One Piece
                      </span>
                      {hvSpy != null && (
                        <span className="mindex-tip-row spy">
                          <i /> <b>{num(hvSpy)}</b> SPY
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          ) : (
            <p className="muted">{t("Graf sa doplní – index sa zbiera každý deň, treba aspoň dva dni.", "The chart will fill in – the index is collected daily and needs at least two days.")}</p>
          )}

          {idx.length >= 2 && (
            <button className="btn ghost sm" onClick={() => (setTable(!table), setHover(null))}>
              {table ? t("Graf", "Chart") : t("Tabuľka", "Table")}
            </button>
          )}
        </>
      ) : (
        <div className="empty">{t("Index sa ešte nezačal zbierať. Prvý bod pribudne pri najbližšom dennom spracovaní.", "The index hasn't started collecting yet. The first point will appear with the next daily run.")}</div>
      )}

      <p className="tiny muted mindex-note">
        {t("Index je orientačný a nie je investičné odporúčanie: keď vyjde nový set, jeho karty a boxy pribudnú do koša. Jednotlivé ceny nájdeš v", "The index is a guide, not investment advice: when a new set comes out, its cards and boxes join the basket. Individual prices are in")} <Link href="/pohyby">{t("Pohyboch cien", "Price moves")}</Link> {t("a", "and")} <Link href="/boxy">{t("Hodnotách boxov", "Box values")}</Link>.
      </p>
    </div>
  );
}
