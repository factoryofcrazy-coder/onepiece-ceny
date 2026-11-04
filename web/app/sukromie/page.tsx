import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Zásady súkromia – Grand Line Tracker" };

export default function Privacy() {
  return (
    <article className="ucet legal">
      <h1>Zásady súkromia</h1>
      <p className="muted small">Platné od 4. 11. 2026</p>
      <p>
        Grand Line Tracker je neoficiálny fanúšikovský projekt zameraný na kartové hry, ktorý je zadarmo. Prevádzkuje ho Gandel, kontaktovať ho môžeš cez Report. Ukladáme len to, čo web potrebuje na fungovanie. Údaje
        nepredávame a nepoužívame ich na reklamu.
      </p>

      <h2>Čo ukladáme a kto to vidí</h2>
      <ul>
        <li><b>E-mail a heslo:</b> slúžia na prihlásenie. E-mail ostatní hráči nevidia, heslo ukladáme len v nečitateľnej (hashovanej) podobe.</li>
        <li><b>Prezývka:</b> vidia ju ostatní prihlásení hráči.</li>
        <li><b>Zbierka a sledované produkty:</b> vidíš ich len ty.</li>
        <li><b>Decky:</b> vidia ich ostatní prihlásení hráči.</li>
        <li><b>Ponuky na trhovisku a kontakt, ktorý k nim vyplníš:</b> vidia ich všetci prihlásení, preto uvádzaj len kontakt, ktorý chceš zverejniť.</li>
        <li><b>Hry a hodnotenie:</b> výsledky, ELO a mená hráčov vidia prihlásení hráči, karty v ruke súper nevidí.</li>
        <li><b>Hlásenia v Reporte:</b> text, stav a odpoveď správcu sú verejné pre každého, aj neprihláseného, ale bez tvojho mena. Kontakt, typ prehliadača a väzbu na účet vidí len správca. Hlásenie z hry obsahuje aj stav hry, ktorý vidí len správca. Do textu nepíš osobné údaje.</li>
        <li><b>Level a rank:</b> XP, level a rank vidia ostatní prihlásení hráči, prehľad dnešných XP podľa aktivít vidíš len ty.</li>
        <li><b>Chat:</b> správy a tvoju prezývku vidia všetci prihlásení. Správca môže správy mazať a zablokovať písanie. Ak správu nahlásiš, správca vidí jej text a kto ju nahlásil. Počet ľudí online je len číslo, bez mien. Správy sa mažú po 30 dňoch alebo so zmazaním účtu.</li>
      </ul>

      <h2>Skener a kamera</h2>
      <p>Obraz z kamery sa spracúva priamo v tvojom zariadení. Neposiela sa na náš server a neukladáme ho.</p>

      <h2>Prečo údaje spracúvame</h2>
      <p>Aby sme ti mohli poskytnúť účet a funkcie webu, ktoré si si vybral, a aby sme ho chránili pred zneužitím a opravovali chyby.</p>

      <h2>Kde sú údaje uložené</h2>
      <ul>
        <li><b>Supabase</b> (databáza a prihlásenie, server v Írsku).</li>
        <li><b>Vercel</b> (prevádzka webu).</li>
        <li>
          Ak je pri prihlásení zapnuté overenie, že nie si robot, zabezpečuje ho <b>Cloudflare Turnstile</b>. E-maily na zmenu hesla posiela e-mailová služba, ktorej odovzdáme tvoju adresu.
        </li>
        <li><b>Discord:</b> text nového hlásenia, bez kontaktu a mena, dostane správca ako upozornenie.</li>
        <li>Obrázky kariet a knižnica skenera sa načítavajú z externých serverov, ktoré tak vidia tvoju IP adresu.</li>
      </ul>

      <h2>Prehliadač</h2>
      <p>
        Používame len nevyhnutné úložisko: prihlásenie, zvolenú hru, vzhľad, stav chatu a tvoj postup v tréningu. Reklamné ani analytické cookies nepoužívame.
      </p>

      <h2>Ako dlho</h2>
      <p>
        Údaje účtu držíme, kým účet nezmažeš. Hlásenia sa po zmazaní účtu odpoja od účtu a ostanú bez mena medzi úlohami. Ak chceš niektoré odstrániť, napíš nám. Správy z chatu sa mažú po 30 dňoch.
      </p>

      <h2>Tvoje práva</h2>
      <p>
        Prezývku a zbierku si upravíš sám. <Link href="/ucet">Účet</Link> si môžeš kedykoľvek zmazať. Ak chceš kópiu údajov, opravu alebo máš inú otázku, napíš nám cez{" "}
        <Link href="/report">Report</Link> a uveď kontakt.
      </p>
    </article>
  );
}
