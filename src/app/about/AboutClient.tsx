"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Language = "it" | "en";

const copy = {
  it: {
    back: "Indietro",
    eyebrow: "Associazione culturale · Italia",
    title: "Non creiamo solo eventi.",
    titleAccent: "Creiamo ricordi.",
    intro:
      "LEDVELVET dà vita a esperienze immersive in cui musica, atmosfera e luoghi non convenzionali si incontrano in una dimensione sospesa tra passato e presente.",
    scroll: "Scopri il manifesto",
    chapters: [
      {
        number: "01",
        label: "Visione",
        title: "Oltre la notte",
        body:
          "Ogni progetto nasce da una ricerca attenta e consapevole. Non inseguiamo semplicemente l’intrattenimento: costruiamo occasioni in cui la musica dialoga con l’identità del luogo e lascia un segno nella memoria di chi le vive.",
      },
      {
        number: "02",
        label: "Esperienza",
        title: "Sound. Light. Space.",
        body:
          "Spazi storici, borghi toscani e scenari inattesi diventano, per una notte, ambienti dal fascino contemporaneo e vellutato. Location, allestimento, luce e suono sono parte di un unico racconto; la musica ne è il cuore pulsante.",
      },
      {
        number: "03",
        label: "Community",
        title: "LEDVELVET Society",
        body:
          "Una comunità curata per chi condivide la nostra visione e desidera partecipare alla sua evoluzione. Uno spazio di appartenenza e continuità, con progetti speciali, esperienze riservate e iniziative dedicate.",
      },
      {
        number: "04",
        label: "Evoluzione",
        title: "Da un luogo a una città",
        body:
          "La nostra identità attraversa contesti urbani e culturali diversi. Milano Velluto, nato durante la Women’s Fashion Week, e Firenze Velluto sono espressioni di un percorso che continua a trasformarsi senza perdere la propria anima.",
      },
    ],
    valuesLabel: "Il nostro codice",
    values: ["Music", "Places", "Community"],
    closing: "Notti irripetibili. Esperienze che restano.",
  },
  en: {
    back: "Back",
    eyebrow: "Cultural association · Italy",
    title: "We don’t just create events.",
    titleAccent: "We create memories.",
    intro:
      "LEDVELVET creates immersive experiences where music, atmosphere and unconventional places meet in a dimension suspended between past and present.",
    scroll: "Discover the manifesto",
    chapters: [
      {
        number: "01",
        label: "Vision",
        title: "Beyond the night",
        body:
          "Every project begins with thoughtful research and a conscious vision. We go beyond entertainment, creating occasions where music enters into dialogue with the identity of a place and leaves a lasting impression on those who experience it.",
      },
      {
        number: "02",
        label: "Experience",
        title: "Sound. Light. Space.",
        body:
          "Historic spaces, Tuscan villages and unexpected settings become contemporary, velvet-toned environments for one night. Location, set design, light and sound belong to a single narrative; music is its beating heart.",
      },
      {
        number: "03",
        label: "Community",
        title: "LEDVELVET Society",
        body:
          "A curated community for those who share our vision and want to take part in its evolution. A space for belonging and continuity, with special projects, reserved experiences and dedicated initiatives.",
      },
      {
        number: "04",
        label: "Evolution",
        title: "From a place to a city",
        body:
          "Our identity moves through different urban and cultural settings. Milano Velluto, created during Women’s Fashion Week, and Firenze Velluto express a journey that keeps evolving without losing its soul.",
      },
    ],
    valuesLabel: "Our code",
    values: ["Music", "Places", "Community"],
    closing: "Unrepeatable nights. Experiences that remain.",
  },
} as const;

export default function AboutClient() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("it");
  const text = copy[language];

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_8%,rgba(147,11,12,0.24),transparent_32%),radial-gradient(circle_at_12%_55%,rgba(147,11,12,0.1),transparent_30%)]" />
      <div className="fixed inset-0 pointer-events-none opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:72px_72px]" />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] uppercase text-white/65 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            {text.back}
          </button>

          <div
            className="flex rounded-full border border-white/15 bg-white/[0.04] p-1"
            aria-label="Seleziona lingua"
          >
            {(["it", "en"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLanguage(item)}
                className={`rounded-full px-4 py-2 text-[9px] font-semibold tracking-[0.24em] uppercase transition ${
                  language === item
                    ? "bg-[#930b0c] text-white shadow-[0_0_22px_rgba(147,11,12,0.45)]"
                    : "text-white/45 hover:text-white"
                }`}
                aria-pressed={language === item}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100svh-73px)] max-w-7xl items-end px-5 pb-14 pt-24 md:px-10 md:pb-20 md:pt-32">
        <div className="absolute right-[-0.08em] top-8 select-none text-[clamp(8rem,27vw,24rem)] font-black leading-none tracking-[-0.09em] text-white/[0.025]">
          LV
        </div>

        <div className="relative w-full">
          <div className="mb-10 flex items-center gap-4 text-[9px] font-semibold tracking-[0.36em] uppercase text-[#ff4b4e] md:mb-14">
            <span className="h-px w-10 bg-[#930b0c]" />
            {text.eyebrow}
          </div>

          <h1 className="max-w-6xl text-[clamp(3.65rem,10vw,9rem)] font-black leading-[0.82] tracking-[-0.065em] uppercase">
            <span className="block text-white">{text.title}</span>
            <span className="block text-white/18">{text.titleAccent}</span>
          </h1>

          <div className="mt-12 grid items-end gap-10 md:mt-16 md:grid-cols-[1fr_1.1fr]">
            <div className="hidden text-[9px] tracking-[0.3em] uppercase text-white/35 md:block">
              MUSIC / CULTURE / COMMUNITY
            </div>
            <p className="max-w-2xl border-l border-[#930b0c] pl-5 text-base leading-8 text-white/70 md:pl-7 md:text-xl md:leading-9">
              {text.intro}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              document.getElementById("manifesto")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="mt-14 inline-flex items-center gap-3 text-[9px] font-semibold tracking-[0.28em] uppercase text-white/45 transition hover:text-white md:mt-20"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15">↓</span>
            {text.scroll}
          </button>
        </div>
      </section>

      <section id="manifesto" className="relative border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-32">
          <div className="space-y-20 md:space-y-32">
            {text.chapters.map((chapter, index) => (
              <article
                key={chapter.number}
                className={`grid gap-7 border-t border-white/10 pt-7 md:grid-cols-[0.25fr_0.75fr_1.2fr] md:gap-12 md:pt-10 ${
                  index % 2 ? "md:ml-[8%]" : "md:mr-[8%]"
                }`}
              >
                <div className="text-[11px] font-semibold tracking-[0.3em] text-[#ff4b4e]">
                  {chapter.number}
                </div>
                <div>
                  <div className="text-[9px] font-semibold tracking-[0.34em] uppercase text-white/35">
                    {chapter.label}
                  </div>
                  <h2 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.04em] md:text-5xl">
                    {chapter.title}
                  </h2>
                </div>
                <p className="max-w-2xl text-base leading-8 text-white/62 md:text-lg md:leading-9">
                  {chapter.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 bg-[#930b0c]/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(147,11,12,0.55),transparent_58%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <div className="text-center text-[9px] font-semibold tracking-[0.36em] uppercase text-[#ff6b6e]">
            {text.valuesLabel}
          </div>
          <div className="mt-10 flex flex-col items-center justify-center gap-2 text-center text-[clamp(3.2rem,9vw,8rem)] font-black leading-[0.88] tracking-[-0.06em] uppercase md:mt-14">
            {text.values.map((value, index) => (
              <div key={value} className={index === 1 ? "text-white/20" : "text-white"}>
                {value}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
        <p className="max-w-4xl text-[clamp(2.5rem,7vw,6.5rem)] font-black leading-[0.9] tracking-[-0.055em] uppercase text-white">
          {text.closing}
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-14 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] uppercase text-white/65 transition hover:text-white"
        >
          <span aria-hidden="true">←</span>
          {text.back}
        </button>
        <div className="mt-16 flex flex-col gap-3 border-t border-white/10 pt-6 text-[9px] tracking-[0.28em] uppercase text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} LEDVELVET</span>
          <span>Cultural association · Toscana</span>
        </div>
      </footer>
    </main>
  );
}
