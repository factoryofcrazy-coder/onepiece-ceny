import { GET } from "./pk_route.mjs";
const out = [];
for (const q of ["", "?set=me02", "?set=sv08", "?q=pikachu"]) {
  const t = Date.now();
  const r = await GET(new Request("http://x/api/pkcards" + q));
  const d = await r.json();
  const s = { q, status: r.status, ms: Date.now() - t, cc: r.headers.get("cache-control") };
  if (d.sets) Object.assign(s, { sets: d.sets.length, first: d.sets.slice(0, 3) });
  if (d.cards) Object.assign(s, { cards: d.cards.length, priced: d.priced, set: d.set, sample: d.cards.slice(10, 13), rev: d.cards.filter(c => c.v === "Reverse Holo").length, top: [...d.cards].sort((a,b)=>(b.eur??0)-(a.eur??0)).slice(0,3).map(c=>[c.name,c.v,c.eur]) });
  if (d.error) s.error = d.error;
  out.push(s);
}
console.log(JSON.stringify(out, null, 1));
