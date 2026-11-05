/** Rozhodovanie skenera: kedy je karta v zábere dosť stabilne a kedy už odišla. Bez prehliadača, aby sa dalo testovať. */
export type Hit = { id: string; score: number };
export type Accepted = {
  id: string;
  score: number;
  top: Hit[];
  unsure: boolean;
  /** ostatné verzie tej istej karty, ktoré model tiež našiel */
  sameCode: string[];
  /** najbližší súper je iná verzia tej istej karty → karta je isto správna, treba overiť verziu */
  checkVersion: boolean;
};

export const CFG = {
  /** priemerné skóre víťaza, od ktorého sa karta pridá */
  ACCEPT: 0.45,
  /** nad týmto skóre sa výsledok vôbec berie ako karta */
  EMPTY: 0.38,
  /** pod týmto skóre alebo pri tesnom súperovi → „Skontroluj“ */
  SURE: 0.52,
  MARGIN: 0.04,
  /** ako dlho musí byť karta v zábere */
  HOLD_MS: 600,
  /** za aký čas sa hlasuje (na pomalých telefónoch aspoň MIN_FRAMES snímok, najviac MAX_WINDOW_MS) */
  WINDOW_MS: 1000,
  MAX_WINDOW_MS: 3000,
  MIN_FRAMES: 3,
  SHARE: 0.7,
  /** po pridaní: karta musí odísť aspoň na toľko */
  GONE_MS: 500,
  /** tá istá karta sa nepridá znova skôr */
  REPEAT_MS: 2500,
};

/** Herný kód karty: OP06-115_r1 → OP06-115. Verzie tej istej karty často vyzerajú rovnako, preto sa hlasuje za kód. */
export const cardCode = (id: string) => id.replace(/^[A-Z0-9]+_(?=[A-Z]+\d*-)/, "").split(/[_-](?=(?:pr|p|r|cm)\d)/i)[0];

type Vote = { t: number; top: Hit[] | null };

export class Decider {
  private hist: Vote[] = [];
  private lock: { code: string; goneSince: number } | null = null;
  private recent = new Map<string, number>();

  get locked() {
    return !!this.lock;
  }
  get lockedCode() {
    return this.lock?.code ?? null;
  }
  reset() {
    this.hist = [];
    this.lock = null;
  }

  /** Jedna snímka. top = výsledky rozpoznania (prázdne, ak detektor kartu nenašiel). */
  frame(now: number, top: Hit[]): Accepted | null {
    const best = top[0];
    const isCard = !!best && best.score >= CFG.EMPTY;

    if (this.lock) {
      // karta odišla = nič v zábere, alebo s istotou iná karta
      const other = isCard && best.score >= CFG.ACCEPT && cardCode(best.id) !== this.lock.code;
      if (!isCard || other) {
        if (!this.lock.goneSince) this.lock.goneSince = now;
        if (now - this.lock.goneSince < CFG.GONE_MS) return null;
        this.lock = null;
        this.hist = [];
      } else {
        this.lock.goneSince = 0;
        return null;
      }
    }

    this.hist.push({ t: now, top: isCard ? top : null });
    // okno: posledná sekunda, ale aspoň MIN_FRAMES snímok (pomalé telefóny), nie staršie ako MAX_WINDOW_MS
    this.hist = this.hist.filter(
      (v, i, a) => now - v.t < CFG.WINDOW_MS || (a.length - i <= CFG.MIN_FRAMES && now - v.t < CFG.MAX_WINDOW_MS),
    );
    const h = this.hist;
    if (!isCard || h.length < CFG.MIN_FRAMES || now - h[0].t < CFG.HOLD_MS) return null;

    const code = cardCode(best.id);
    const votes = h.filter((v) => v.top && cardCode(v.top[0].id) === code);
    if (votes.length / h.length < CFG.SHARE) return null;
    const avg = votes.reduce((s, v) => s + v.top![0].score, 0) / votes.length;
    if (avg < CFG.ACCEPT) return null;
    if (now - (this.recent.get(code) ?? -1e9) < CFG.REPEAT_MS) return null;

    // verzia: priemerné skóre každej verzie cez hlasujúce snímky
    const sum = new Map<string, number>();
    for (const v of votes) for (const x of v.top!) sum.set(x.id, (sum.get(x.id) ?? 0) + x.score);
    const ranked: Hit[] = [...sum.entries()].map(([id, s]) => ({ id, score: s / votes.length })).sort((a, b) => b.score - a.score);
    const win = ranked.find((x) => cardCode(x.id) === code)!;
    const rest = ranked.filter((x) => x.id !== win.id);
    const close = rest.length > 0 && win.score - rest[0].score < CFG.MARGIN;

    this.recent.set(code, now);
    this.lock = { code, goneSince: 0 };
    return {
      id: win.id,
      score: avg,
      top: [win, ...rest],
      unsure: avg < CFG.SURE || close,
      sameCode: rest.filter((x) => cardCode(x.id) === code).map((x) => x.id),
      checkVersion: close && cardCode(rest[0].id) === code,
    };
  }
}
