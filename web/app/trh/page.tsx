"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loading } from "@/components/ui";
import { indexed, IndexPoint, loadMarketIndex } from "@/lib/market";

const W = 720, H = 220, PAD = 28, BOT = 26;
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" });

export default function Page() {
  const [points, setPoints] = useState<IndexPoint[] | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    loadMarketIndex().then(setPoints);
  }, []);

  const idx = useMemo(() => (points ? indexed(points) : []), [points]);

  if (points === null) return <Loading shape="rows" />;

  const latest = idx[idx.length - 1];
  const prev = idx[idx.length - 2];
  const pctTxt = (v: number) => (v > 0 ? `▲ ${v.toLocaleString("sk-SK", { maximumFractionDigits: 1 })} %` : v < 0 ? `▼ ${(-v).toLocaleString("sk-SK", { maximumFractionDigits: 1 })} %` : "bez zmeny");
  const pctDay = prev ? (latest.idx / prev.idx - 1) * 100 : null;
  const pctAll = latest ? (latest.idx / 1000 - 1) * 100 : null;

  // graf
  const vals = idx.map((p) => p.idx);
  const lo = Math.min(...vals, 1000), hi = Math.max(...vals, 1000);
  const pad = (hi - lo) * 0.12 || 50;
  const y0 = lo - pad, y1 = hi + pad;
  const x = (i: number) => PAD + (idx.length <= 1 ? 0 : (i / (idx.length - 1)) * (W - PAD * 2));
  const y = (v: number) => PAD + (1 - (v - y0) / (y1 - y0)) * (H - PAD - BOT);
  const line = idx.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.idx).toFixed(1)}`).join(" ");
  const area = idx.length > 1 ? `${line} L${x(idx.length - 1).toFixed(1)} ${H - BOT} L${x(0).toFixed(1)} ${H - BOT} Z` : "";

  return (
    <div className="mindex">
      <h1>Trhový index</h1>
      <p className="muted small">
        Vývoj celého trhu One Piece podľa priemernej trend ceny kariet (od 1 €) a boxov na Cardmarkete. Základ 1000 je prvý zaznamenaný deň.
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

          {idx.length >= 2 ? (
            table ? (
              <table className="graded-table mindex-table">
                <thead>
                  <tr>
                    <th scope="col">Deň</th>
                    <th scope="col">Index</th>
                  </tr>
                </thead>
                <tbody>
                  {[...idx].reverse().map((p) => (
                    <tr key={p.day}>
                      <th scope="row">{dayLabel(p.day)}</th>
                      <td>{Math.round(p.idx).toLocaleString("sk-SK")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pchart mindex-chart">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graf vývoja trhového indexu" preserveAspectRatio="none">
                  <line x1={PAD} y1={y(1000)} x2={W - PAD} y2={y(1000)} className="mindex-base" />
                  {area && <path d={area} className="mindex-area" />}
                  <path d={line} className="mindex-line" fill="none" />
                  {idx.map((p, i) => (
                    <circle key={p.day} cx={x(i)} cy={y(p.idx)} r={3} className="mindex-dot" />
                  ))}
                  <text x={PAD} y={H - 8} className="mindex-ax">
                    {dayLabel(idx[0].day)}
                  </text>
                  <text x={W - PAD} y={H - 8} textAnchor="end" className="mindex-ax">
                    {dayLabel(idx[idx.length - 1].day)}
                  </text>
                </svg>
              </div>
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
        Index je orientačný: keď vyjde nový set, jeho karty a boxy pribudnú do koša. Jednotlivé ceny nájdeš v <Link href="/pohyby">Pohyboch cien</Link> a <Link href="/boxy">Hodnotách boxov</Link>.
      </p>
    </div>
  );
}
