// Zábery kariet na kontrolu: v prehliadači (IndexedDB), nech prežijú reštart stránky. Na server nejdú. Chyba úložiska nesmie zastaviť skenovanie.
const DB = "op-scan", STORE = "shots";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const t = db.transaction(STORE, mode);
      const q = run(t.objectStore(STORE));
      t.oncomplete = () => res(q ? q.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  } finally {
    db.close();
  }
}

export const saveShot = (key: number, blob: Blob) => tx("readwrite", (s) => s.put(blob, key)).catch(() => undefined);

/** Zábery pre dané karty ako adresy pre <img>. */
export async function loadShots(keys: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  await Promise.all(
    keys.map(async (k) => {
      const b = await tx<Blob>("readonly", (s) => s.get(k)).catch(() => undefined);
      if (b) out.set(k, URL.createObjectURL(b));
    }),
  );
  return out;
}

/** Zmaže zábery kariet, ktoré už v zozname nie sú. */
export const pruneShots = (keep: number[]) =>
  tx("readwrite", (s) => {
    const want = new Set(keep);
    const cur = s.openKeyCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return;
      if (!want.has(c.key as number)) s.delete(c.key);
      c.continue();
    };
  }).catch(() => undefined);
