"use client";
import { useEffect, useState } from "react";

type Platform = "android" | "ios" | "pc";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const TABS: { id: Platform; label: string }[] = [
  { id: "android", label: "Android" },
  { id: "ios", label: "iPhone" },
  { id: "pc", label: "Počítač" },
];

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

export default function InstallGuide() {
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

  const guide = STEPS[platform];
  return (
    <div className="ucet app-guide">
      <h1>Aplikácia do mobilu</h1>
      <p className="muted">Grand Line Tracker si pridáš na plochu ako bežnú aplikáciu: má vlastnú ikonu a otvára sa na celú obrazovku. Nič nesťahuješ z obchodu a je to zadarmo.</p>

      {installed && <p className="okc">Aplikáciu už používaš, netreba nič robiť.</p>}

      {prompt && !installed && (
        <button className="btn" onClick={install}>
          Nainštalovať aplikáciu
        </button>
      )}

      <div className="rep-kinds" role="tablist" aria-label="Zariadenie">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={platform === t.id} className={platform === t.id ? "on" : ""} onClick={() => setPlatform(t.id)}>
            {t.label}
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
        <p className="tiny muted">Názvy v menu sa môžu podľa verzie telefónu trochu líšiť.</p>
      </section>

      <section className="ucet-card">
        <h2>Dobré vedieť</h2>
        <ul className="app-steps">
          <li>Aktualizácie sú automatické, nič nemusíš inštalovať znova.</li>
          <li>Aplikácia potrebuje internet.</li>
          <li>Prvýkrát sa v aplikácii znova prihlás, prihlásenie z prehliadača sa nemusí preniesť.</li>
          <li>Skener si pri prvom spustení vypýta prístup ku kamere, povoľ ho.</li>
          <li>Odstránenie je rovnaké ako pri inej aplikácii: podrž ikonu a vyber odstránenie.</li>
        </ul>
      </section>
    </div>
  );
}
