import { DM_ENABLED } from "@/lib/config";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang } from "@/lib/lang-shared";

const langNow = async () => parseLang((await cookies()).get(LANG_COOKIE)?.value);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await langNow()) === "en" ? "Privacy policy – Grand Line Tracker" : "Zásady súkromia – Grand Line Tracker" };
}

export default async function Privacy() {
  return (await langNow()) === "en" ? <PrivacyEn /> : <PrivacySk />;
}

function PrivacySk() {
  return (
    <article className="ucet legal">
      <img className="legal-art" src="/art/sukromie.webp" width={1672} height={941} alt="Grand-Line.eu: Luffy v troch podobách nad zasneženým hradom" />
      <h1>Zásady súkromia</h1>
      <p className="muted small">Platné od 4. 11. 2026</p>
      <p>
        Grand Line Tracker je neoficiálny fanúšikovský projekt zameraný na kartové hry, ktorý je zadarmo. Prevádzkuje ho Gandel, kontaktovať ho môžeš cez Report. Ukladáme len to, čo web potrebuje na fungovanie. Údaje
        nepredávame a nepoužívame ich na reklamu.
      </p>

      <h2>Čo ukladáme a kto to vidí</h2>
      <ul>
        <li><b>E-mail a heslo:</b> slúžia na prihlásenie. E-mail ostatní hráči nevidia, heslo ukladáme len v nečitateľnej (hashovanej) podobe.</li>
        <li><b>Prezývka:</b> v rebríčku a pri ponukách na trhovisku ju vidí každý, aj neprihlásený. Inde ju vidia prihlásení hráči.</li>
        <li><b>Zbierka a sledované produkty:</b> vidíš ich len ty.</li>
        <li><b>Nákupné ceny a kusy:</b> nákupnú cenu, dátum, stav, grading, číslo certifikátu, hodnotu, ktorú si zapíšeš, a poznámku ku kusu vidíš len ty. Číslo certifikátu sa inam pošle, len keď klikneš na odkaz na jeho overenie. Zmažú sa so zrušením účtu.</li>
        <li><b>Decky:</b> vidia ich ostatní prihlásení hráči.</li>
        <li><b>Ponuky na trhovisku:</b> vidí ich každý, aj neprihlásený. <b>Kontakt, ktorý k nim vyplníš,</b> vidia len prihlásení, preto uvádzaj len kontakt, ktorý chceš zverejniť. Do poznámky k ponuke kontakt nepíš, tú vidí každý.</li>
        <li><b>Hry a hodnotenie:</b> ELO a štatistiky v rebríčku vidí každý, priebeh a výsledky jednotlivých hier len prihlásení hráči, karty v ruke súper nevidí.</li>
        <li><b>Hlásenia v Reporte:</b> text, stav a odpoveď správcu sú verejné pre každého, aj neprihláseného, ale bez tvojho mena. Kontakt, typ prehliadača a väzbu na účet vidí len správca. Hlásenie z hry obsahuje aj stav hry, ktorý vidí len správca. Do textu nepíš osobné údaje.</li>
        <li><b>Level a rank:</b> XP, level a rank vidí v rebríčku každý, prehľad dnešných XP podľa aktivít vidíš len ty.</li>
        {DM_ENABLED && (
          <li>
            <b>Súkromné správy:</b> text je v databáze šifrovaný a kľúč je uložený mimo nej, takže samotný únik databázy text neprezradí. Nejde o šifrovanie medzi zariadeniami: prevádzkovateľ by správy technicky vedel otvoriť. Správca nemá rozhranie na čítanie konverzácií. Keď niekto správu nahlási, správca uvidí ju a najviac 5 správ pred ňou a 5 po nej. V databáze je nešifrované, kto komu a kedy písal a kedy si správu prečítal. Správy sa mažú po 12 mesiacoch a so zrušením účtu. Ak zapneš notifikácie, text prechádza šifrovane cez notifikačnú službu tvojho prehliadača (Google, Apple alebo Mozilla) a zobrazí sa na tvojom zariadení, v nastaveniach správ ho môžeš skryť.
          </li>
        )}
        <li><b>Reakcie na správy:</b> vo verejnom chate vidia všetci prihlásení, kto a ako reagoval. V súkromných správach to vidí druhá osoba a reakcia je v databáze uložená bez šifrovania, ale text správy v nej nie je. Zmaže sa spolu so správou.</li>
        <li><b>Skener:</b> záber z kamery sa spracúva len v tvojom zariadení a nikam sa neposiela. Ak sa stránka skenera počas skenovania reštartuje, uložíme technický záznam: účet, čas, typ prehliadača, ako dlho skener bežal a počet kariet v zozname, bez záberov a názvov kariet. Záznam sa po 90 dňoch zmaže.</li>
        <li><b>Chat:</b> správy a tvoju prezývku vidia všetci prihlásení. Správca môže správy mazať a zablokovať písanie. Ak správu nahlásiš, správca vidí jej text a kto ju nahlásil. Počet ľudí online je len číslo, bez mien. Správy sa mažú po 30 dňoch alebo so zmazaním účtu.</li>
      </ul>

      <h2>Skener a kamera</h2>
      <p>Obraz z kamery sa spracúva priamo v tvojom zariadení a neposiela sa na náš server. Zábery naskenovaných kariet na kontrolu ostávajú len v tvojom prehliadači a zmažú sa, keď kartu odstrániš alebo pridáš do zbierky.</p>

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
        <li><b>Ceny hodnotených kariet:</b> z toho, ktoré karty sú v zbierkach, vyberáme, ktorým zistíme cenu. Do služby Apify ide len kód karty, bez účtu a údajov o tom, kto kartu má.</li>
        <li>Odkazy na predaje na eBay a overenie certifikátu sa otvoria až po tvojom kliknutí, dovtedy sa tam nič neposiela.</li>
        <li>Obrázky kariet a knižnica skenera sa načítavajú z externých serverov, ktoré tak vidia tvoju IP adresu.</li>
      </ul>

      <h2>Prehliadač</h2>
      <p>
        Používame len nevyhnutné úložisko: prihlásenie, zvolenú hru, vzhľad, jazyk, stav chatu a tvoj postup v tréningu. Reklamné ani analytické cookies nepoužívame.
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

function PrivacyEn() {
  return (
    <article className="ucet legal">
      <img className="legal-art" src="/art/sukromie.webp" width={1672} height={941} alt="Grand-Line.eu: Luffy in three forms above a snowy castle" />
      <h1>Privacy policy</h1>
      <p className="muted small">Effective from 4 November 2026. The Slovak version is the binding one.</p>
      <p>
        Grand Line Tracker is an unofficial, free fan project about trading card games. It is run by Gandel; you can get in touch through Report. We only store what the site needs to work. We don&apos;t sell
        data and don&apos;t use it for advertising.
      </p>

      <h2>What we store and who can see it</h2>
      <ul>
        <li><b>E-mail and password:</b> used to sign in. Other players can&apos;t see your e-mail; the password is only stored in an unreadable (hashed) form.</li>
        <li><b>Nickname:</b> everyone, even signed-out visitors, can see it on the leaderboard and on marketplace listings. Elsewhere only signed-in players see it.</li>
        <li><b>Collection and watched products:</b> only you can see them.</li>
        <li><b>Purchase prices and copies:</b> the purchase price, date, condition, grading, certificate number, the value you enter and the note for a copy are visible only to you. The certificate number is only sent elsewhere when you click the link to verify it. They are deleted when you delete your account.</li>
        <li><b>Decks:</b> other signed-in players can see them.</li>
        <li><b>Marketplace listings:</b> everyone can see them, even signed-out visitors. <b>The contact you add to them</b> is visible only to signed-in players, so only give a contact you want to make public. Don&apos;t put contact details in the listing note – everyone can see it.</li>
        <li><b>Games and rating:</b> everyone can see ELO and stats on the leaderboard; the course and results of individual games are visible to signed-in players only, and your opponent can&apos;t see the cards in your hand.</li>
        <li><b>Report submissions:</b> the text, status and the admin&apos;s reply are public to everyone, even signed-out visitors, but without your name. Only the admin sees the contact, browser type and link to your account. A report from a game also contains the game state, which only the admin sees. Don&apos;t include personal details in the text.</li>
        <li><b>Level and rank:</b> everyone can see XP, level and rank on the leaderboard; only you see today&apos;s XP breakdown by activity.</li>
        {DM_ENABLED && (
          <li>
            <b>Private messages:</b> the text is encrypted in the database and the key is stored outside it, so a database leak alone won&apos;t reveal the text. This is not end-to-end encryption: the operator could technically open the messages. The admin has no interface for reading conversations. When someone reports a message, the admin sees it and at most 5 messages before and 5 after it. Who wrote to whom, when, and when a message was read is stored unencrypted. Messages are deleted after 12 months and when the account is deleted. If you turn on notifications, the text passes encrypted through your browser&apos;s notification service (Google, Apple or Mozilla) and is shown on your device; you can hide it in message settings.
          </li>
        )}
        <li><b>Message reactions:</b> in the public chat all signed-in players can see who reacted and how. In private messages the other person sees it, and the reaction is stored in the database unencrypted, but it doesn&apos;t contain the message text. It is deleted together with the message.</li>
        <li><b>Scanner:</b> the camera image is processed only on your device and is not sent anywhere. If the scanner page restarts while scanning, we save a technical record: account, time, browser type, how long the scanner ran and the number of cards in the list, without images or card names. The record is deleted after 90 days.</li>
        <li><b>Chat:</b> all signed-in players can see messages and your nickname. The admin can delete messages and block writing. If you report a message, the admin sees its text and who reported it. The number of people online is just a number, without names. Messages are deleted after 30 days or when the account is deleted.</li>
      </ul>

      <h2>Scanner and camera</h2>
      <p>The camera image is processed directly on your device and is not sent to our server. Shots of scanned cards kept for review stay only in your browser and are deleted when you remove the card or add it to your collection.</p>

      <h2>Why we process data</h2>
      <p>To provide your account and the site features you chose, to protect the site against abuse and to fix bugs.</p>

      <h2>Where data is stored</h2>
      <ul>
        <li><b>Supabase</b> (database and sign-in, server in Ireland).</li>
        <li><b>Vercel</b> (hosting the site).</li>
        <li>
          If the &quot;not a robot&quot; check is enabled at sign-in, it is provided by <b>Cloudflare Turnstile</b>. Password reset e-mails are sent by an e-mail service that receives your address.
        </li>
        <li><b>Discord:</b> the admin receives the text of a new report, without contact or name, as a notification.</li>
        <li><b>Graded card prices:</b> we use which cards are in collections to choose which ones to look up prices for. Only the card code goes to the Apify service, without the account or any data about who owns the card.</li>
        <li>Links to eBay sales and certificate verification only open after you click; nothing is sent there before that.</li>
        <li>Card images and the scanner library are loaded from external servers, which can therefore see your IP address.</li>
      </ul>

      <h2>Browser</h2>
      <p>
        We only use essential storage: sign-in, the selected game, appearance, language, chat state and your training progress. We don&apos;t use advertising or analytics cookies.
      </p>

      <h2>How long</h2>
      <p>
        We keep account data until you delete the account. After the account is deleted, reports are detached from it and stay among the tasks without a name. If you want any removed, write to us. Chat messages are deleted after 30 days.
      </p>

      <h2>Your rights</h2>
      <p>
        You can edit your nickname and collection yourself. You can delete your <Link href="/ucet">account</Link> at any time. If you want a copy of your data, a correction or have another question, write to us through{" "}
        <Link href="/report">Report</Link> and include a contact.
      </p>
    </article>
  );
}
