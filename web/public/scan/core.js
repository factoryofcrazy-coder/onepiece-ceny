/* Geometria skenera bez závislostí: zmenšenie záberu, kontrola nájdených rohov, narovnanie karty.
   Beží vo Web Workeri (importScripts) aj v testoch. */
(function (root) {
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

  /** RGBA záber → normalizovaný tensor CHW s priemerovaním pixelov (bez aliasingu). */
  function downscaleToTensor(rgba, w, h, dw, dh) {
    const plane = dw * dh, x = new Float32Array(3 * plane);
    for (let j = 0; j < dh; j++) {
      const y0 = Math.floor((j * h) / dh), y1 = Math.max(y0 + 1, Math.floor(((j + 1) * h) / dh));
      for (let i = 0; i < dw; i++) {
        const x0 = Math.floor((i * w) / dw), x1 = Math.max(x0 + 1, Math.floor(((i + 1) * w) / dw));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) {
          let o = (yy * w + x0) * 4;
          for (let xx = x0; xx < x1; xx++, o += 4) { r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; n++; }
        }
        const p = j * dw + i;
        x[p] = (r / n / 255 - MEAN[0]) / STD[0];
        x[plane + p] = (g / n / 255 - MEAN[1]) / STD[1];
        x[2 * plane + p] = (b / n / 255 - MEAN[2]) / STD[2];
      }
    }
    return x;
  }

  /** Vyzerajú rohy (poradie: ľavý horný, pravý horný, pravý dolný, ľavý dolný; 0–1) ako karta v zábere s pomerom strán viewRatio = š/v? */
  function quadPlausible(q, viewRatio, minArea) {
    const P = [];
    for (let i = 0; i < 4; i++) {
      const x = q[i * 2], y = q[i * 2 + 1];
      if (!(x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02)) return false;
      P.push([x * viewRatio, y]);
    }
    let sign = 0, area = 0;
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4], c = P[(i + 2) % 4];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cr === 0 || (sign && Math.sign(cr) !== sign)) return false;
      sign = Math.sign(cr);
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (sign < 0) return false; // zrkadlovo otočené rohy
    if (Math.abs(area) / 2 / viewRatio < (minArea ?? 0.05)) return false;
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const w = (len(P[0], P[1]) + len(P[3], P[2])) / 2, h = (len(P[0], P[3]) + len(P[1], P[2])) / 2;
    const ratio = w / h; // karta 63 : 88 = 0,716; šikmý pohľad to trochu mení
    return ratio > 0.5 && ratio < 1.0;
  }

  /** Homografia, ktorá zobrazí (0,0)-(W,0)-(W,H)-(0,H) na štvoruholník q (pixely). */
  function homography(W, H, q) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    return [a / W, b / H, x0, d / W, e / H, y0, g / W, h / H, 1];
  }

  /** Narovná kartu: výstup RGBA dw×dh. Každý cieľový pixel je priemer ss×ss vzoriek (bilineárne), nech jemné detaily nezmizli. */
  function warp(rgba, w, h, q, dw, dh, ss) {
    ss = ss || 2;
    const M = homography(dw, dh, q), out = new Uint8ClampedArray(dw * dh * 4), n = ss * ss;
    const xmax = w - 1, ymax = h - 1;
    for (let j = 0; j < dh; j++)
      for (let i = 0; i < dw; i++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < ss; sy++)
          for (let sx = 0; sx < ss; sx++) {
            const u = i + (sx + 0.5) / ss, v = j + (sy + 0.5) / ss;
            const z = M[6] * u + M[7] * v + 1;
            let X = (M[0] * u + M[1] * v + M[2]) / z - 0.5, Y = (M[3] * u + M[4] * v + M[5]) / z - 0.5;
            X = X < 0 ? 0 : X > xmax ? xmax : X;
            Y = Y < 0 ? 0 : Y > ymax ? ymax : Y;
            const x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0;
            const x1 = x0 < xmax ? 1 : 0, y1 = y0 < ymax ? w : 0;
            const o = (y0 * w + x0) * 4, ox = o + x1 * 4, oy = o + y1 * 4, oxy = oy + x1 * 4;
            for (let c = 0; c < 3; c++) {
              const t = rgba[o + c] * (1 - fx) + rgba[ox + c] * fx, m = rgba[oy + c] * (1 - fx) + rgba[oxy + c] * fx;
              const val = t * (1 - fy) + m * fy;
              if (c === 0) r += val; else if (c === 1) g += val; else b += val;
            }
          }
        const p = (j * dw + i) * 4;
        out[p] = r / n; out[p + 1] = g / n; out[p + 2] = b / n; out[p + 3] = 255;
      }
    return out;
  }

  /** RGBA dw×dh → normalizovaný tensor CHW. */
  function toTensor(rgba, dw, dh) {
    const plane = dw * dh, x = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      x[i] = (rgba[i * 4] / 255 - MEAN[0]) / STD[0];
      x[plane + i] = (rgba[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
      x[2 * plane + i] = (rgba[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    }
    return x;
  }

  /** Najlepších k záznamov indexu (int8, škála 127), jedna karta najviac raz. */
  function search(z, index, ids, dim, k) {
    const n = ids.length, best = new Map();
    for (let i = 0, o = 0; i < n; i++, o += dim) {
      let s = 0;
      for (let d = 0; d < dim; d++) s += z[d] * index[o + d];
      s /= 127;
      const prev = best.get(ids[i]);
      if (prev === undefined || s > prev) best.set(ids[i], s);
    }
    return [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id, score]) => ({ id, score }));
  }

  root.ScanCore = { downscaleToTensor, quadPlausible, homography, warp, toTensor, search };
})(typeof self !== "undefined" ? self : globalThis);
