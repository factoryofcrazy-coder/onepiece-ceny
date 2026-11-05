import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// core.js je obyčajný skript pre Web Worker
new Function(readFileSync(new URL("../../public/scan/core.js", import.meta.url), "utf8"))();
const C = (globalThis as any).ScanCore;

function pattern(w: number, h: number) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = (x / w) * 255; px[o + 1] = (y / h) * 255; px[o + 2] = 40; px[o + 3] = 255;
    }
  return px;
}

describe("quadPlausible", () => {
  const R = 0.75;
  const rect = (x: number, y: number, h: number) => { const w = (h * (63 / 88)) / R; return [x, y, x + w, y, x + w, y + h, x, y + h]; };
  it("prijme kartu v zábere, aj menšiu a šikmú", () => {
    expect(C.quadPlausible(rect(0.1, 0.1, 0.8), R)).toBe(true);
    expect(C.quadPlausible(rect(0.3, 0.3, 0.4), R)).toBe(true);
    const q = rect(0.1, 0.1, 0.8); q[0] += 0.03; q[6] -= 0.02;
    expect(C.quadPlausible(q, R)).toBe(true);
  });
  it("odmietne nezmysly", () => {
    expect(C.quadPlausible(rect(0.45, 0.45, 0.1), R)).toBe(false); // priveľmi malá
    expect(C.quadPlausible([0.1, 0.1, 0.9, 0.1, 0.9, 0.2, 0.1, 0.2], R)).toBe(false); // zlý pomer strán
    expect(C.quadPlausible([0.1, 0.1, 0.5, 0.8, 0.5, 0.1, 0.1, 0.8], R)).toBe(false); // prekrížené
    expect(C.quadPlausible([0.5, 0.1, 0.1, 0.1, 0.1, 0.9, 0.5, 0.9], R)).toBe(false); // zrkadlovo
    expect(C.quadPlausible([-0.5, 0.1, 0.5, 0.1, 0.5, 0.9, -0.5, 0.9], R)).toBe(false); // mimo záberu
    expect(C.quadPlausible(Array(8).fill(0.5), R)).toBe(false); // všetky rohy v jednom bode
  });
});

describe("homography + warp", () => {
  it("rohy výstupu padnú na zadaný štvoruholník", () => {
    const q = [10, 20, 110, 30, 120, 170, 5, 160], M = C.homography(224, 313, q);
    const f = (u: number, v: number) => { const z = M[6] * u + M[7] * v + M[8]; return [(M[0] * u + M[1] * v + M[2]) / z, (M[3] * u + M[4] * v + M[5]) / z]; };
    [[0, 0], [224, 0], [224, 313], [0, 313]].forEach(([u, v], i) => {
      const [x, y] = f(u, v);
      expect(x).toBeCloseTo(q[i * 2], 6);
      expect(y).toBeCloseTo(q[i * 2 + 1], 6);
    });
  });
  it("narovnanie obdĺžnika zachová farby na správnom mieste", () => {
    const w = 300, h = 400, px = pattern(w, h), q = [50, 100, 250, 100, 250, 380, 50, 380];
    const out = C.warp(px, w, h, q, 100, 140, 2);
    const at = (i: number, j: number) => [out[(j * 100 + i) * 4], out[(j * 100 + i) * 4 + 1]];
    expect(Math.abs(at(0, 0)[0] - (50 / w) * 255)).toBeLessThan(3);
    expect(Math.abs(at(0, 0)[1] - (100 / h) * 255)).toBeLessThan(3);
    expect(Math.abs(at(99, 139)[0] - (250 / w) * 255)).toBeLessThan(3);
    expect(Math.abs(at(99, 139)[1] - (380 / h) * 255)).toBeLessThan(3);
    expect(out[3]).toBe(255);
  });
  it("rohy mimo obrazu nespadnú", () => {
    expect(C.warp(pattern(50, 50), 50, 50, [-5, -5, 60, -5, 60, 60, -5, 60], 20, 28, 2).length).toBe(20 * 28 * 4);
  });
});

describe("downscaleToTensor", () => {
  it("priemeruje a normalizuje", () => {
    const px = new Uint8ClampedArray(16 * 4).fill(255);
    const x = C.downscaleToTensor(px, 4, 4, 2, 2);
    expect(x.length).toBe(12);
    expect(x[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    expect(x[11]).toBeCloseTo((1 - 0.406) / 0.225, 4);
  });
});

describe("search", () => {
  it("nájde najbližšiu kartu a zlúči viac záznamov jednej karty", () => {
    const idx = new Int8Array([127, 0, 90, 90, 100, 0, 0, 127]);
    const top = C.search([1, 0], idx, ["A", "B", "A", "C"], 2, 3);
    expect(top.map((h: any) => h.id)).toEqual(["A", "B", "C"]);
    expect(top[0].score).toBeCloseTo(1, 5);
  });
});
