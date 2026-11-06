"use client";
import { useMemo, useState } from "react";
import { eur } from "@/lib/data";
import { soldSearchUrl } from "@/lib/copies";
import { FIRM_ROWS, FirmId, FIRMS, GradedPrice } from "@/lib/grading";

const date = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "2-digit", timeZone: "UTC" });

/** Ceny hodnotených kusov po firmách. Riadok bez predajov ostáva, má len odkaz, nech je zoznam stále rovnaký. */
export default function GradedTable({ code, prices, usd }: { code: string; prices: GradedPrice[]; usd: number }) {
  const first = useMemo(() => FIRMS.find((f) => FIRM_ROWS[f.id].some((r) => prices.some((p) => p.grader === r.grader && p.grade === r.grade)))?.id, [prices]);
  const [picked, setPicked] = useState<FirmId | null>(null);
  const firm = picked ?? first ?? "PSA";
  return (
    <section className="pchart graded-links" aria-label="Predaje hodnotených kariet">
      <div className="pchart-head">
        <h3>Hodnotené kusy</h3>
        <div className="pchart-range" role="group" aria-label="Firma">
          {FIRMS.map((f) => (
            <button key={f.id} className={f.id === firm ? "on" : ""} aria-pressed={f.id === firm} onClick={() => setPicked(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <table className="graded-table">
        <thead>
          <tr>
            <th scope="col">Známka</th>
            <th scope="col">Cena</th>
            <th scope="col">Predaje</th>
            <th scope="col"><span className="sr-only">Na eBay</span></th>
          </tr>
        </thead>
        <tbody>
          {FIRM_ROWS[firm].map((r) => {
            const p = prices.find((x) => x.grader === r.grader && x.grade === r.grade);
            return (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{p ? <b>{eur(p.median / 100 / usd)}</b> : <span className="muted">–</span>}</td>
                <td className="muted">{p ? `${p.sales}×${p.last_sold ? `, ${date(p.last_sold)}` : ""}` : ""}</td>
                <td>
                  <a href={soldSearchUrl(code, r.search, r.grade)} target="_blank" rel="noreferrer" aria-label={`${r.label}: predané kusy na eBay`}>
                    eBay ↗
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tiny muted">Cena je medián predajov na eBay, najmä z USA, prepočítaný na eurá. Na eBay skontroluj, že ide o rovnakú verziu karty.</p>
    </section>
  );
}
