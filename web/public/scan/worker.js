/* Skener kariet – beží vo Web Workeri, aby kamera nesekala.
   1) malá sieť nájde v zábere štyri rohy karty,  2) karta sa narovná,
   3) EfficientNet-B0 z nej spraví 256-rozmerný odtlačok,  4) porovná sa s indexom všetkých kariet. */
const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
importScripts(ORT + "ort.all.min.js"); // WebGPU (rýchle) + WebAssembly (záloha)
importScripts("/scan/core.js?v=2");
ort.env.wasm.wasmPaths = ORT;
ort.env.wasm.numThreads = 1; // vlákna potrebujú cross-origin isolation – bez nej 1

let backend = "", session = null, det = null, index = null, ids = null, dim = 0;
const IW = 224, IH = 313, VW = 192, VH = 256;
const T_OBJ = 0.5, T_PEAK = 0.15; // pod tým v zábere asi nie je celá karta

const need = (r, what) => { if (!r.ok) throw new Error(what + " " + r.status); return r; };

async function init(game, v) {
  const base = `/scan/${game}`;
  const [model, detModel, meta, idx] = await Promise.all([
    fetch(`${base}-model.onnx?v=${v}`).then((r) => need(r, "model").arrayBuffer()),
    fetch(`${base}-det.onnx?v=${v}`).then((r) => need(r, "detektor").arrayBuffer()),
    fetch(`${base}-index.json?v=${v}`).then((r) => need(r, "index").json()),
    fetch(`${base}-index.bin?v=${v}`).then((r) => need(r, "index").arrayBuffer()),
  ]);
  ids = meta.ids; dim = meta.dim;
  index = new Int8Array(idx);
  if (index.length !== ids.length * dim) throw new Error("index nesedí s metadátami");
  // WebGPU tam, kde je (Chrome Android, nové Safari) – inak WebAssembly
  backend = "wasm";
  if (self.navigator && navigator.gpu) {
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
      backend = "webgpu";
    } catch (e) { session = null; }
  }
  if (!session) session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  det = await ort.InferenceSession.create(detModel, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }); // malý, stačí WebAssembly
  // zahriatie (prvý beh je pomalý)
  await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", new Float32Array(3 * IW * IH), [1, 3, IH, IW]) });
  await det.run({ [det.inputNames[0]]: new ort.Tensor("float32", new Float32Array(3 * VW * VH), [1, 3, VH, VW]) });
}

async function scan(m) {
  const t0 = performance.now();
  const d = await det.run({ x: new ort.Tensor("float32", ScanCore.downscaleToTensor(m.pixels, m.w, m.h, VW, VH), [1, 3, VH, VW]) });
  const corners = Array.from(d.corners.data), obj = d.obj.data[0], peak = Math.min(...d.peak.data);
  const t1 = performance.now();
  if (obj < T_OBJ || peak < T_PEAK || !ScanCore.quadPlausible(corners, m.w / m.h)) {
    postMessage({ type: "result", seq: m.seq, quad: null, top: [], obj, peak, ms: Math.round(t1 - t0), msDet: Math.round(t1 - t0) });
    return;
  }
  const q = corners.map((c, i) => c * (i % 2 ? m.h : m.w));
  const rect = ScanCore.warp(m.pixels, m.w, m.h, q, IW, IH, 2);
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", ScanCore.toTensor(rect, IW, IH), [1, 3, IH, IW]) });
  const top = ScanCore.search(out[session.outputNames[0]].data, index, ids, dim, 8);
  postMessage({ type: "result", seq: m.seq, quad: corners, top, obj, peak, rect, ms: Math.round(performance.now() - t0), msDet: Math.round(t1 - t0) }, [rect.buffer]);
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const t = performance.now();
      await init(m.game, m.v);
      postMessage({ type: "ready", ms: Math.round(performance.now() - t), cards: new Set(ids).size, backend });
    } else if (m.type === "scan") await scan(m);
  } catch (err) {
    postMessage({ type: "error", seq: m.seq, error: String((err && err.message) || err) });
  }
};
