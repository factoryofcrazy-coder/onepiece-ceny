"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang";

type Platform = "android" | "ios" | "pc";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const TABS: { id: Platform; label: string }[] = [
  { id: "android", label: "Android" },
  { id: "ios", label: "iPhone" },
  { id: "pc", label: "Počítač" },
];
const TABS_EN: Record<Platform, string> = { android: "Android", ios: "iPhone", pc: "Computer" };

const STEPS: Record<Platform, { note: string; steps: string[] }> = {
  android: {
    note: "Otvor web v prehliadači Chrome.",
    steps: [
      "Vpravo hore ťukni na tri bodky.",
      "Vyber Inštalovať aplikáciu alebo Pridať na plochu.",
      "Potvrď tlačidlom Inštalovať.",
      "Ikona Grand Line sa objaví na ploche alebo medzi aplikáciami.",
    ],
  },
  ios: {
    note: "Otvor web v Safari.",
    steps: [
      "Ťukni na tlačidlo Zdieľať (štvorec so šípkou nahor).",
      "Posuň sa nižšie a vyber Pridať na plochu.",
      "Vpravo hore ťukni na Pridať.",
      "Ikona Grand Line sa objaví na ploche.",
    ],
  },
  pc: {
    note: "Otvor web v prehliadači Chrome alebo Edge.",
    steps: [
      "V paneli s adresou klikni na ikonu inštalácie vpravo.",
      "Ak tam nie je, otvor menu prehliadača a hľadaj Inštalovať alebo Aplikácie.",
      "Potvrď tlačidlom Inštalovať.",
    ],
  },
};

const STEPS_EN: Record<Platform, { note: string; steps: string[] }> = {
  android: {
    note: "Open the site in Chrome.",
    steps: ["Tap the three dots in the top right.", "Choose Install app or Add to Home screen.", "Confirm with Install.", "The Grand Line icon appears on your home screen or among your apps."],
  },
  ios: {
    note: "Open the site in Safari.",
    steps: ["Tap the Share button (square with an arrow up).", "Scroll down and choose Add to Home Screen.", "Tap Add in the top right.", "The Grand Line icon appears on your home screen."],
  },
  pc: {
    note: "Open the site in Chrome or Edge.",
    steps: ["Click the install icon on the right of the address bar.", "If it isn't there, open the browser menu and look for Install or Apps.", "Confirm with Install."],
  },
};

export default function InstallGuide() {
  const { t, lang } = useLang();
  const [platform, setPlatform] = useState<Platform>("android");
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(ios ? "ios" : /Android/.test(ua) ? "android" : "pc");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  const guide = (lang === "en" ? STEPS_EN : STEPS)[platform];
  return (
    <div className="ucet app-guide">
      <h1>{t("Aplikácia do mobilu", "Mobile app")}</h1>
      <p className="muted">{t("Grand Line Tracker si pridáš na plochu ako bežnú aplikáciu: má vlastnú ikonu a otvára sa na celú obrazovku. Nič nesťahuješ z obchodu a je to zadarmo.", "Add Grand Line Tracker to your home screen like a regular app: it has its own icon and opens full screen. Nothing to download from a store and it's free.")}</p>

      {installed && <p className="okc">{t("Aplikáciu už používaš, netreba nič robiť.", "You're already using the app, nothing to do.")}</p>}

      {prompt && !installed && (
        <button className="btn" onClick={install}>
          {t("Nainštalovať aplikáciu", "Install app")}
        </button>
      )}

      <div className="rep-kinds" role="tablist" aria-label={t("Zariadenie", "Device")}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={platform === t.id} className={platform === t.id ? "on" : ""} onClick={() => setPlatform(t.id)}>
            {lang === "en" ? TABS_EN[t.id] : t.label}
          </button>
        ))}
      </div>

      <section className="ucet-card">
        <p>
          <b>{guide.note}</b>
        </p>
        <ol className="app-steps">
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="tiny muted">{t("Názvy v menu sa môžu podľa verzie telefónu trochu líšiť.", "Menu names may differ slightly depending on your phone's version.")}</p>
      </section>

      <section className="ucet-card">
        <h2>{t("Dobré vedieť", "Good to know")}</h2>
        <ul className="app-steps">
          <li>{t("Aktualizácie sú automatické, nič nemusíš inštalovať znova.", "Updates are automatic, you don't need to reinstall anything.")}</li>
          <li>{t("Aplikácia potrebuje internet.", "The app needs an internet connection.")}</li>
          <li>{t("Prvýkrát sa v aplikácii znova prihlás, prihlásenie z prehliadača sa nemusí preniesť.", "Sign in again the first time in the app, your browser sign-in may not carry over.")}</li>
          <li>{t("Skener si pri prvom spustení vypýta prístup ku kamere, povoľ ho.", "The scanner asks for camera access the first time, allow it.")}</li>
          <li>{t("Odstránenie je rovnaké ako pri inej aplikácii: podrž ikonu a vyber odstránenie.", "Removing it works like any other app: hold the icon and choose remove.")}</li>
        </ul>
      </section>
    </div>
  );
}
