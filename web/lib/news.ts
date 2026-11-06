import { sb } from "@/lib/supabase";

export type NewsItem = { id: string; created_at: string; title: string; body: string | null; url: string | null };

export async function loadNews(): Promise<NewsItem[]> {
  const { data } = await sb().from("news").select("id, created_at, title, body, url").order("created_at", { ascending: false }).limit(100);
  return (data as NewsItem[]) ?? [];
}

export async function addNews(x: { title: string; body: string; url: string }): Promise<string | null> {
  const title = x.title.trim();
  if (!title) return "Nadpis je povinný.";
  let url = x.url.trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  const { error } = await sb().from("news").insert({ title, body: x.body.trim() || null, url: url || null });
  return error?.message ?? null;
}

export async function removeNews(id: string): Promise<string | null> {
  const { error } = await sb().from("news").delete().eq("id", id);
  return error?.message ?? null;
}
