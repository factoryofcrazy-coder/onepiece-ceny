import { sb } from "@/lib/supabase";

export type NewsItem = { id: string; created_at: string; title: string; body: string | null; url: string | null; image: string | null };

/** Odhad času čítania: ~200 slov za minútu, najmenej 1 min. */
export function readMins(body: string | null | undefined): number {
  const words = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export async function loadNews(): Promise<NewsItem[]> {
  const { data } = await sb().from("news").select("id, created_at, title, body, url, image").order("created_at", { ascending: false }).limit(100);
  return (data as NewsItem[]) ?? [];
}

export async function addNews(x: { title: string; body: string; url: string; image: string }): Promise<string | null> {
  const title = x.title.trim();
  if (!title) return "Nadpis je povinný.";
  const link = (s: string) => {
    s = s.trim();
    return s && !/^https?:\/\//i.test(s) ? "https://" + s : s;
  };
  const { error } = await sb().from("news").insert({ title, body: x.body.trim() || null, url: link(x.url) || null, image: link(x.image) || null });
  return error?.message ?? null;
}

export async function removeNews(id: string): Promise<string | null> {
  const { error } = await sb().from("news").delete().eq("id", id);
  return error?.message ?? null;
}
