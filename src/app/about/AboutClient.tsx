// src/app/about/AboutClient.tsx
"use client";

import { useRouter } from "next/navigation";

export default function AboutClient() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-[#EDEDED]">
      {/* Top bar with Back */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center">
          <button
            onClick={() => router.back()}
            className="text-sm px-3 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,38,255,0.18),transparent_45%),radial-gradient(circle_at_80%_40%,rgba(59,130,246,0.14),transparent_55%)]" />
        <div className="relative max-w-5xl mx-auto px-4 py-16 md:py-20">
          <p className="text-xs tracking-[0.22em] uppercase opacity-70">
            Led Velvet
          </p>
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight">
            About Us
          </h1>
          <p className="mt-4 max-w-2xl text-base md:text-lg opacity-80">
            An association devoted to orchestrating unparalleled and captivating
            events, where music and unconventional venues merge into timeless
            experiences.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-5xl mx-auto px-4 py-10 md:py-14">
        <div className="grid gap-10">
          {/* IT */}
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">IT – Chi siamo</h2>
            <p className="mt-4 opacity-85 leading-relaxed">
              <b>Led Velvet</b> è un’associazione culturale dedicata alla creazione di eventi
              unici e immersivi, in cui musica, atmosfera e luoghi non convenzionali si
              fondono in esperienze senza tempo. Ogni progetto nasce da una ricerca attenta
              e consapevole, con l’obiettivo di trasformare spazi storici e contesti
              inaspettati in scenari evocativi, capaci di accogliere il pubblico in una
              dimensione sospesa tra passato e presente.
            </p>

            <h3 className="mt-8 text-xl font-semibold">Missione</h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              La missione di Led Velvet è dare forma a eventi che vadano oltre
              l’intrattenimento, creando occasioni speciali in cui la musica dialoga con
              l’identità del luogo. Attraverso selezioni musicali curate e atmosfere
              raffinate, l’associazione costruisce serate pensate per lasciare un segno
              duraturo nella memoria dei partecipanti.
            </p>

            <h3 className="mt-8 text-xl font-semibold">Eventi</h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              Gli eventi Led Velvet sono viaggi sensoriali concepiti per valorizzare spazi
              storici, borghi toscani e ambienti suggestivi trasformati, per una notte, in
              lounge dal fascino vintage. Ogni dettaglio è studiato con attenzione: la
              scelta della location, l’allestimento, la luce e il suono contribuiscono a
              creare un’esperienza coerente, elegante e coinvolgente. La musica, affidata a
              DJ selezionati per sensibilità e visione artistica, è l’elemento centrale che
              accompagna e amplifica le emozioni della serata.
            </p>

            <h3 className="mt-8 text-xl font-semibold">Led Velvet Society</h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              All’interno di questo percorso nasce <b>Led Velvet Society</b>, una comunità
              curata che riunisce coloro che condividono la visione dell’associazione e
              partecipano attivamente alla sua evoluzione. La Society è pensata come uno
              spazio di appartenenza e continuità, in cui i membri possono accedere a
              progetti speciali, esperienze riservate e iniziative dedicate, nel rispetto
              dei valori e delle regole associative.
            </p>

            <h3 className="mt-8 text-xl font-semibold">
              Progetti speciali e collaborazioni
            </h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              Led Velvet promuove la sperimentazione e l’innovazione, sviluppando format
              ricorrenti che si adattano a contesti urbani e culturali diversi. Nel tempo,
              questa visione ha dato vita a una serie di eventi ospitati in città chiave,
              all’interno di club e spazi selezionati che diventano temporaneamente
              espressione dell’identità Led Velvet. Progetti come <b>Milano Velluto</b>,
              nato durante la Women’s Fashion Week, e <b>Firenze Velluto</b> rappresentano
              l’evoluzione naturale di questo percorso.
            </p>

            <p className="mt-6 opacity-85 leading-relaxed">
              Led Velvet è sinonimo di eleganza, attenzione al dettaglio e passione per la
              musica. Attraverso un approccio distintivo e consapevole, l’associazione
              continua a creare momenti irripetibili per la propria comunità, mantenendo
              sempre al centro la qualità dell’esperienza.
            </p>
          </article>

          {/* EN */}
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">EN – About Us</h2>
            <p className="mt-4 opacity-85 leading-relaxed">
              <b>Led Velvet</b> is a cultural association devoted to the creation of unique
              and immersive events, where music, atmosphere, and unconventional venues
              merge into timeless experiences. Each project is born from careful research
              and a conscious approach, with the aim of transforming historic spaces and
              unexpected settings into evocative environments, capable of welcoming
              participants into a dimension suspended between past and present.
            </p>

            <h3 className="mt-8 text-xl font-semibold">Mission</h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              Led Velvet’s mission is to shape events that go beyond entertainment,
              creating special occasions where music enters into dialogue with the identity
              of the location. Through curated musical selections and refined atmospheres,
              the association designs evenings intended to leave a lasting impression in
              the memories of those who take part.
            </p>

            <h3 className="mt-8 text-xl font-semibold">Events</h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              Led Velvet events are sensory journeys conceived to enhance historic spaces,
              Tuscan villages, and evocative environments temporarily transformed into
              vintage-inspired lounges. Every detail is carefully considered: from the
              choice of location to the set design, lighting, and sound, all elements
              contribute to a coherent, elegant, and engaging experience. Music, entrusted
              to carefully selected DJs for their sensitivity and artistic vision, stands
              at the core of each event, guiding and amplifying the emotions of the night.
            </p>

            <h3 className="mt-8 text-xl font-semibold">Led Velvet Society</h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              Within this path, <b>Led Velvet Society</b> was created as a curated
              community bringing together those who share the association’s vision and
              actively participate in its evolution. The Society is conceived as a space
              of belonging and continuity, offering its members access to special projects,
              reserved experiences, and dedicated initiatives, in accordance with the
              association’s values and regulations.
            </p>

            <h3 className="mt-8 text-xl font-semibold">
              Special projects and collaborations
            </h3>
            <p className="mt-3 opacity-85 leading-relaxed">
              Led Velvet embraces experimentation and innovation, developing recurring
              formats that adapt to different urban and cultural contexts. Over time, this
              vision has evolved into a series of special events hosted in key cities,
              within selected clubs and venues that temporarily become expressions of the
              Led Velvet identity. Projects such as <b>Milano Velluto</b>, created during
              Women’s Fashion Week, and <b>Firenze Velluto</b> represent the natural
              evolution of this journey.
            </p>

            <p className="mt-6 opacity-85 leading-relaxed">
              Led Velvet stands for elegance, attention to detail, and a deep passion for
              music. Through a distinctive and thoughtful approach to event creation, the
              association continues to craft unrepeatable moments for its community, always
              with a focus on quality and excellence.
            </p>
          </article>
        </div>

        <div className="mt-10 text-xs opacity-60">
          © {new Date().getFullYear()} Led Velvet
        </div>
      </section>
    </main>
  );
}
