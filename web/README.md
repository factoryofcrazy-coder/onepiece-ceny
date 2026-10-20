# Grand Line Tracker (web)

Next.js appka na Verceli: ceny sealed produktov, kolekcia kariet, master sety a deckbuilder.

| Časť | Kde beží | Zadarmo |
|---|---|---|
| Stránka + API (`/api/cards`, `/api/prices`, `/api/ping`) | Vercel Hobby, root directory `web/` | áno |
| Login + kolekcie + decky | Supabase (projekt `onepiece-tracker`) | áno (free tier) |
| Ceny zo SK/CZ obchodov | GitHub Actions + `spustit.bat` na PC → GitHub Pages | áno |
| Databáza kariet + ceny kariet | optcgapi.com (TCGplayer ceny), cache 24 h na Verceli | áno |

- Každý push do `main` sa na Verceli nasadí automaticky.
- `/api/prices` číta `docs/data/prices.json` (alebo dáta zo `docs/index.html`), cache 10 min.
- Vercel Cron raz denne volá `/api/ping` → Supabase free projekt sa neuspí.
- Schéma databázy: `supabase/schema.sql` (už nasadená).

Lokálne: `cd web && npm install && npm run dev` → http://localhost:3000
