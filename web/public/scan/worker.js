/* Skener kariet – beží vo Web Workeri, aby kamera nesekala.
   Model (EfficientNet-B0 + naučená projekcia) spraví z výrezu karty 256-rozmerný odtlačok,
   ten sa porovná s indexom všetkých kariet (int8, kosínusová podobnosť). */
const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
importScripts(ORT + "ort.all.min.js"); // WebGPU (rýchle) + WebAssembly (záloha)
ort.env.wasm.wasmPaths = ORT;
ort.env.wasm.numThreads = 1; // vlákna potrebujú cross-origin isolation – bez nej 1

let backend = "", session = null, index = null, ids = null, dim = 0, n = 0, inName = "", outName = "";
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const IW = 224, IH = 313;

async function init(game, v) {
  const base = `/scan/${game}`;
  const [model, meta, idx] = await Promise.all([
    fetch(`${base}-model.onnx?v=${v}`).then((r) => { if (!r.ok) throw new Error("model " + r.status); return r.arrayBuffer(); }),
    fetch(`${base}-index.json?v=${v}`).then((r) => r.json()),
    fetch(`${base}-index.bin?v=${v}`).then((r) => r.arrayBuffer()),
  ]);
  ids = meta.ids; dim = meta.dim; n = ids.length;
  index = new Int8Array(idx);
  if (index.length !== n * dim) throw new Error("index nesedí s metadátami");
  // WebGPU tam, kde je (Chrome Android, nové Safari) – inak WebAssembly
  backend = "wasm";
  if (self.navigator && navigator.gpu) {
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
      backend = "webgpu";
    } catch (e) { session = null; }
  }
  if (!session) session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  inName = session.inputNames[0]; outName = session.outputNames[0];
  // zahriatie (prvý beh je pomalý)
  await session.run({ [inName]: new ort.Tensor("float32", new Float32Array(3 * IW * IH), [1, 3, IH, IW]) });
}

function toTensor(rgba) {
  const plane = IW * IH, x = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    x[i] = (rgba[i * 4] / 255 - MEAN[0]) / STD[0];
    x[plane + i] = (rgba[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    x[2 * plane + i] = (rgba[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return new ort.Tensor("float32", x, [1, 3, IH, IW]);
}

function search(z, k) {
  // kosínus voči int8 indexu (index aj z sú normalizované; int8 škála 127)
  const best = []; // [score, i] zoradené zostupne, dĺžka k
  for (let i = 0, o = 0; i < n; i++, o += dim) {
    let s = 0;
    for (let d = 0; d < dim; d++) s += z[d] * index[o + d];
    s /= 127;
    if (best.length < k || s > best[best.length - 1][0]) {
      let j = best.length < k ? best.length : k - 1;
      best[j] = [s, i];
      while (j > 0 && best[j][0] > best[j - 1][0]) { const t = best[j]; best[j] = best[j - 1]; best[j - 1] = t; j--; }
    }
  }
  return best.map(([s, i]) => ({ id: ids[i], score: s }));
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const t = performance.now();
      await init(m.game, m.v);
      postMessage({ type: "ready", ms: Math.round(performance.now() - t), cards: n, backend });
    } else if (m.type === "scan") {
      const t = performance.now();
      const out = await session.run({ [inName]: toTensor(m.pixels) });
      const z = out[outName].data; // už L2-normalizované v modeli
      const top = search(z, 8);
      postMessage({ type: "result", seq: m.seq, top, ms: Math.round(performance.now() - t) });
    }
  } catch (err) {
    postMessage({ type: "error", seq: m.seq, error: String(err && err.message || err) });
  }
};
