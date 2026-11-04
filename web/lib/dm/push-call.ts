import { sb } from "../supabase";

/** volanie funkcie "dm" pre notifikácie, oddelené od client.tsx, aby lib/auth nemal cyklickú závislosť */
export async function dmPushCall<T = any>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().functions.invoke("dm", { body: { op, ...body } });
  if (error) {
    let msg = "Notifikácie sa nepodarilo nastaviť. Skús to znova.";
    try {
      const j = await ((error as any).context as Response | undefined)?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* odpoveď bez JSON */
    }
    throw new Error(msg);
  }
  return data.data as T;
}
