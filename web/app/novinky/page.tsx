"use client";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { addNews, loadNews, NewsItem, readMins, removeNews } from "@/lib/news";
import { useLang } from "@/lib/lang";

const fmt = (d: string, locale: string) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

export default function Page() {
  const { isAdmin } = useAuth();
  const { t, locale } = useLang();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const reload = () => loadNews().then(setItems);
  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="news">
      <h1>{t("Novinky", "News")}</h1>
      <p className="muted small">{t("Nové sety, updaty a dôležité informácie zo sveta One Piece.", "New sets, updates and important news from the world of One Piece.")}</p>
      {isAdmin && <NewsForm onSaved={reload} />}
      {items === null ? (
        <Loading shape="rows" />
      ) : items.length === 0 ? (
        <div className="empty">{t("Zatiaľ žiadne novinky.", "No news yet.")}</div>
      ) : (
        <div className="news-list">
          {items.map((n) => (
            <article key={n.id} className="news-item">
              {n.image && (
                <div className="news-img">
                  <img src={n.image} alt="" loading="lazy" />
                </div>
              )}
              <div className="news-top">
                <h2>{n.title}</h2>
                <time className="muted small">{fmt(n.created_at, locale)}</time>
              </div>
              {n.body && (
                <>
                  <p className="news-meta tiny muted">{readMins(n.body)} {t("min čítania", "min read")}</p>
                  <p className="news-body">{n.body}</p>
                </>
              )}
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
                      if (!confirm(t("Zmazať túto novinku?", "Delete this news item?"))) return;
                      await removeNews(n.id);
                      reload();
                    }}
                  >
                    {t("Zmazať", "Delete")}
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
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useLang();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const error = await addNews({ title, body, url, image });
    setBusy(false);
    if (error) return setErr(error);
    setTitle("");
    setBody("");
    setUrl("");
    setImage("");
    onSaved();
  };

  return (
    <form className="panel news-form" onSubmit={submit}>
      <h2 className="sub">{t("Pridať novinku", "Add news")}</h2>
      <label className="field">
        <span>{t("Nadpis", "Title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={t("Napr. Nový set OP-18 oznámený", "E.g. New set OP-18 announced")} />
      </label>
      <label className="field">
        <span>Text</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} placeholder={t("Krátky popis…", "Short description…")} />
      </label>
      <label className="field">
        <span>{t("Odkaz (nepovinné)", "Link (optional)")}</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://…" />
      </label>
      <label className="field">
        <span>{t("Obrázok – odkaz (nepovinné)", "Image – link (optional)")}</span>
        <input value={image} onChange={(e) => setImage(e.target.value)} maxLength={500} placeholder="https://…/obrazok.jpg" />
      </label>
      {err && <p className="news-err small">{err}</p>}
      <button className="btn" disabled={busy || !title.trim()}>
        {busy ? t("Ukladám…", "Saving…") : t("Pridať", "Add")}
      </button>
    </form>
  );
}
