"use client";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { addNews, loadNews, NewsItem, removeNews } from "@/lib/news";

const fmt = (d: string) => new Date(d).toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" });

export default function Page() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const reload = () => loadNews().then(setItems);
  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="news">
      <h1>Novinky</h1>
      <p className="muted small">Nové sety, updaty a dôležité informácie zo sveta One Piece.</p>
      {isAdmin && <NewsForm onSaved={reload} />}
      {items === null ? (
        <Loading shape="rows" />
      ) : items.length === 0 ? (
        <div className="empty">Zatiaľ žiadne novinky.</div>
      ) : (
        <div className="news-list">
          {items.map((n) => (
            <article key={n.id} className="news-item">
              <div className="news-top">
                <h2>{n.title}</h2>
                <time className="muted small">{fmt(n.created_at)}</time>
              </div>
              {n.body && <p className="news-body">{n.body}</p>}
              <div className="news-foot">
                {n.url && (
                  <a className="small" href={n.url} target="_blank" rel="noreferrer">
                    Viac →
                  </a>
                )}
                {isAdmin && (
                  <button
                    className="news-del small"
                    onClick={async () => {
                      if (!confirm("Zmazať túto novinku?")) return;
                      await removeNews(n.id);
                      reload();
                    }}
                  >
                    Zmazať
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsForm({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const error = await addNews({ title, body, url });
    setBusy(false);
    if (error) return setErr(error);
    setTitle("");
    setBody("");
    setUrl("");
    onSaved();
  };

  return (
    <form className="panel news-form" onSubmit={submit}>
      <h2 className="sub">Pridať novinku</h2>
      <label className="field">
        <span>Nadpis</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="Napr. Nový set OP-18 oznámený" />
      </label>
      <label className="field">
        <span>Text</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} placeholder="Krátky popis…" />
      </label>
      <label className="field">
        <span>Odkaz (nepovinné)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://…" />
      </label>
      {err && <p className="news-err small">{err}</p>}
      <button className="btn" disabled={busy || !title.trim()}>
        {busy ? "Ukladám…" : "Pridať"}
      </button>
    </form>
  );
}
