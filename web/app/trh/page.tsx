"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loading } from "@/components/ui";
import { indexed, IndexPoint, loadMarketIndex, loadSpy, spyAligned, SpyPoint } from "@/lib/market";
import { niceTicks } from "@/lib/price-series";

const W = 720, H = 240, LEFT = 48, RIGHT = 14, TOP = 14, BOT = 28;
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" });
const pctTxt = (v: number) => (v > 0 ? `▲ ${v.toLocaleString("sk-SK", { maximumFractionDigits: 1 })} %` : v < 0 ? `▼ ${(-v).toLocaleString("sk-SK", { maximumFractionDigits: 1 })} %` : "bez zmeny");

export default function Page() {
  const [points, setPoints] = useState<IndexPoint[] | null>(null);
  const [spy, setSpy] = useState<SpyPoint[]>([]);
  const [table, setTable] = useState(false);
  useEffect(() => {
    loadMarketIndex().then(setPoints);
    loadSpy().then(setSpy);
  }, []);

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

  // graf – spoločná os pre obe krivky
  const all = [...idx.map((p) => p.idx), ...spyIdx.filter((v): v is number => v != null), 1000];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 50;
  const yticks = niceTicks(lo - pad, hi + pad).filter((t) => t >= lo - pad && t <= hi + pad);
  const y0 = Math.min(lo - pad, ...yticks), y1 = Math.max(hi + pad, ...yticks);
  const x = (i: number) => LEFT + (idx.length <= 1 ? 0 : (i / (idx.length - 1)) * (W - LEFT - RIGHT));
  const y = (v: number) => TOP + (1 - (v - y0) / (y1 - y0)) * (H - TOP - BOT);
  const line = idx.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.idx).toFixed(1)}`).join(" ");
  const area = idx.length > 1 ? `${line} L${x(idx.length - 1).toFixed(1)} ${(H - BOT).toFixed(1)} L${x(0).toFixed(1)} ${(H - BOT).toFixed(1)} Z` : "";
  const spyLine = spyIdx.map((v, i) => (v == null ? "" : `${i && spyIdx[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(" ");
  const xStep = Math.max(1, Math.ceil(idx.length / 5));
  const xticks = idx.map((p, i) => ({ p, i })).filter(({ i }) => i % xStep === 0 || i === idx.length - 1);

  return (
    <div className="mindex">
      <h1>Trhový index</h1>
      <p className="muted small">
        Vývoj celého trhu One Piece podľa priemernej trend ceny kariet (od 1 €) a boxov na Cardmarkete, porovnaný s akciovým trhom (SPY, teda S&amp;P 500). Základ 1000 je prvý zaznamenaný deň.
      </p>

      {latest ? (
        <>
          <div className="mindex-big">
            <b>{Math.round(latest.idx).toLocaleString("sk-SK")}</b>
            {pctDay != null && <span className={`cmove ${pctDay > 0 ? "up" : pctDay < 0 ? "down" : ""}`}>{pctTxt(pctDay)} za deň</span>}
          </div>
          <p className="muted small">
            {pctAll != null && (
              <>
                Od začiatku <span className={pctAll > 0 ? "cmove up" : pctAll < 0 ? "cmove down" : ""}>{pctTxt(pctAll)}</span>.{" "}
              </>
            )}
            Kôš: {latest.items.toLocaleString("sk-SK")} položiek.
          </p>

          {pctAll != null && spyAll != null && (
            <p className="mindex-verdict">
              Za toto obdobie {Math.abs(pctAll - spyAll) < 0.1 ? "išli rovnako" : pctAll > spyAll ? "rástol rýchlejšie One Piece" : "rástli rýchlejšie akcie"}:{" "}
              <b className="op">One Piece {pctTxt(pctAll)}</b> vs <b className="spy">SPY {pctTxt(spyAll)}</b>.
            </p>
          )}

          {idx.length >= 2 ? (
            table ? (
              <table className="graded-table mindex-table">
                <thead>
                  <tr>
                    <th scope="col">Deň</th>
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
                        <td>{Math.round(p.idx).toLocaleString("sk-SK")}</td>
                        {hasSpy && <td>{s != null ? Math.round(s).toLocaleString("sk-SK") : "–"}</td>}
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
                <div className="pchart mindex-chart">
                  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graf vývoja trhového indexu One Piece a SPY">
                    {yticks.map((t) => (
                      <g key={t}>
                        <line x1={LEFT} y1={y(t)} x2={W - RIGHT} y2={y(t)} className={t === 1000 ? "mindex-base" : "mindex-grid"} />
                        <text x={LEFT - 8} y={y(t) + 3.5} textAnchor="end" className="mindex-ax">
                          {Math.round(t).toLocaleString("sk-SK")}
                        </text>
                      </g>
                    ))}
                    {area && <path d={area} className="mindex-area" />}
                    {hasSpy && spyLine && <path d={spyLine} className="mindex-spy" fill="none" />}
                    <path d={line} className="mindex-line" fill="none" />
                    {xticks.map(({ p, i }) => (
                      <text key={p.day} x={x(i)} y={H - 9} textAnchor={i === 0 ? "start" : i === idx.length - 1 ? "end" : "middle"} className="mindex-ax">
                        {dayLabel(p.day)}
                      </text>
                    ))}
                  </svg>
                </div>
              </>
            )
          ) : (
            <p className="muted">Graf sa doplní – index sa zbiera každý deň, treba aspoň dva dni.</p>
          )}

          {idx.length >= 2 && (
            <button className="btn ghost sm" onClick={() => setTable(!table)}>
              {table ? "Graf" : "Tabuľka"}
            </button>
          )}
        </>
      ) : (
        <div className="empty">Index sa ešte nezačal zbierať. Prvý bod pribudne pri najbližšom dennom spracovaní.</div>
      )}

      <p className="tiny muted mindex-note">
        Index je orientačný a nie je investičné odporúčanie: keď vyjde nový set, jeho karty a boxy pribudnú do koša. Jednotlivé ceny nájdeš v <Link href="/pohyby">Pohyboch cien</Link> a <Link href="/boxy">Hodnotách boxov</Link>.
      </p>
    </div>
  );
}
