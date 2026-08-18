import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function sanitizeInternalPath(p: string): string | null {
  if (!p) return null;
  if (!p.startsWith("/")) return null;
  if (p.startsWith("//")) return null;
  if (p.includes("://")) return null;
  return p;
}

const benefits = [
  {
    number: "01",
    label: "Accesso",
    body: "Accesso prioritario a eventi selezionati e comunicazioni anticipate.",
  },
  {
    number: "02",
    label: "Inviti",
    body: "Inviti riservati a capitoli specifici del percorso Led Velvet.",
  },
  {
    number: "03",
    label: "Contenuti",
    body: "Contenuti curatoriali e materiali dedicati oltre la singola serata.",
  },
  {
    number: "04",
    label: "Esperienze",
    body: "Esperienze pensate oltre l’evento: continuità, qualità, dettagli.",
  },
];

export default function SocietyPage({ searchParams }: Props) {
  const fromRaw = firstParam(searchParams?.from);
  const from = sanitizeInternalPath(fromRaw || "") || "/moment2";

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_85%_12%,rgba(147,11,12,0.25),transparent_34%),radial-gradient(circle_at_10%_66%,rgba(147,11,12,0.12),transparent_34%)]" />
      <div className="fixed inset-0 pointer-events-none opacity-[0.028] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:76px_76px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-10">
          <Link
            href={from}
            className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] uppercase text-white/65 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Torna indietro
          </Link>

          <div className="text-[10px] font-semibold tracking-[0.32em] uppercase text-white/45">
            LV · PEOPLE
          </div>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100svh-73px)] max-w-7xl items-end px-5 pb-16 pt-24 md:px-10 md:pb-24 md:pt-32">
        <div className="absolute right-[-0.05em] top-6 select-none text-[clamp(8rem,28vw,25rem)] font-black leading-none tracking-[-0.1em] text-white/[0.025]">
          PEOPLE
        </div>

        <div className="relative w-full">
          <div className="mb-10 flex items-center gap-4 text-[9px] font-semibold tracking-[0.38em] uppercase text-[#ff4b4e] md:mb-14">
            <span className="h-px w-12 bg-[#930b0c]" />
            Comunità · Membership · Appartenenza
          </div>

          <h1 className="max-w-6xl text-[clamp(4.4rem,13vw,11rem)] font-black leading-[0.78] tracking-[-0.075em] uppercase">
            <span className="block text-white">LV</span>
            <span className="block text-white/20">People</span>
          </h1>

          <div className="mt-12 grid items-end gap-10 md:mt-16 md:grid-cols-[0.85fr_1.15fr]">
            <div className="hidden text-[9px] tracking-[0.3em] uppercase text-white/30 md:block">
              MUSIC / PLACES / COMMUNITY
            </div>
            <div>
              <p className="max-w-2xl border-l border-[#930b0c] pl-5 text-lg leading-8 text-white/72 md:pl-7 md:text-2xl md:leading-10">
                Una comunità curata, non un semplice accesso.
                <br />
                LV PEOPLE non è una tessera. Non è un abbonamento.
                <span className="text-white"> È un modo di appartenere.</span>
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/become-member?from=/society"
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-[10px] font-semibold tracking-[0.22em] uppercase text-black transition hover:bg-[#ff4b4e]"
                >
                  Entra in LV People
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>

                <Link
                  href={from}
                  className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-[10px] font-semibold tracking-[0.22em] uppercase text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Torna all’esperienza
                </Link>
              </div>
            </div>
          </div>

          <a
            href="#manifesto"
            className="mt-14 inline-flex items-center gap-3 text-[9px] font-semibold tracking-[0.28em] uppercase text-white/40 transition hover:text-white md:mt-20"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15">↓</span>
            Scopri LV People
          </a>
        </div>
      </section>

      <section id="manifesto" className="relative border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-32">
          <div className="grid gap-10 md:grid-cols-[0.7fr_1.3fr] md:gap-20">
            <div>
              <div className="text-[9px] font-semibold tracking-[0.34em] uppercase text-[#ff4b4e]">
                Cos’è LV PEOPLE
              </div>
              <h2 className="mt-4 text-[clamp(2.8rem,6vw,6rem)] font-black leading-[0.88] tracking-[-0.055em] uppercase">
                Non solo partecipare.
                <span className="block text-white/18">Farne parte.</span>
              </h2>
            </div>

            <div className="space-y-7 text-base leading-8 text-white/65 md:text-lg md:leading-9">
              <p>
                LV PEOPLE riunisce persone che si riconoscono nell’identità e nella visione dell’associazione. È una comunità costruita sulla presenza, non sui numeri. Chi ne fa parte non “partecipa soltanto”: entra a far parte del racconto.
              </p>
              <p>
                Ogni capitolo nasce con un’intenzione precisa: musica, spazio e atmosfera si incontrano per creare un’esperienza che rimane. La Society esiste per accompagnare questo percorso nel tempo.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 bg-[#930b0c]/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(147,11,12,0.55),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <div className="text-center text-[9px] font-semibold tracking-[0.36em] uppercase text-[#ff6b6e]">
            Cosa offre la Society
          </div>
          <h2 className="mx-auto mt-5 max-w-4xl text-center text-3xl font-black tracking-[-0.04em] md:text-5xl">
            Riconoscimento e continuità, senza meccaniche forzate.
          </h2>

          <div className="mt-14 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((item) => (
              <article
                key={item.number}
                className="group relative min-h-[250px] bg-[#080808] p-7 transition duration-300 hover:bg-[#130708] md:p-8"
              >
                <div className="absolute inset-x-0 top-0 h-px origin-center scale-x-0 bg-[#ff4b4e] transition-transform duration-500 group-hover:scale-x-100" />
                <div className="text-[10px] font-semibold tracking-[0.28em] text-[#ff4b4e]">{item.number}</div>
                <div className="mt-10 text-[10px] font-semibold tracking-[0.28em] uppercase text-white/35">
                  LV People
                </div>
                <h3 className="mt-3 text-2xl font-bold tracking-[-0.035em]">{item.label}</h3>
                <p className="mt-5 text-sm leading-7 text-white/60">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-32">
        <div className="grid gap-16 md:grid-cols-2 md:gap-20">
          <article className="border-t border-white/10 pt-7">
            <div className="text-[9px] font-semibold tracking-[0.34em] uppercase text-[#ff4b4e]">Come funziona</div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] md:text-5xl">Un percorso, non un acquisto.</h2>
            <div className="mt-7 space-y-5 text-base leading-8 text-white/62">
              <p>
                La Society segue i principi e il ciclo annuale dell’associazione. La richiesta di adesione può essere effettuata in qualsiasi momento; la conferma avviene secondo criteri interni e nel rispetto delle regole associative.
              </p>
              <p>Alcuni capitoli sono aperti. Altri sono riservati a chi fa parte della community.</p>
            </div>
          </article>

          <article className="border-t border-white/10 pt-7 md:mt-20">
            <div className="text-[9px] font-semibold tracking-[0.34em] uppercase text-[#ff4b4e]">Society ed eventi</div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] md:text-5xl">Ci sono cose che scopri solo dentro.</h2>
            <div className="mt-7 space-y-5 text-base leading-8 text-white/62">
              <p>
                In alcuni eventi Led Velvet, la Community LV PEOPLE può includere momenti dedicati: accessi anticipati, inviti riservati o capitoli aggiuntivi dell’esperienza.
              </p>
              <p>Non vengono annunciati in modo esplicito. Si scoprono lungo il percorso.</p>
            </div>
          </article>
        </div>
      </section>

      <section id="richiesta" className="relative overflow-hidden border-y border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(147,11,12,0.22),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 text-center md:px-10 md:py-36">
          <div className="text-[9px] font-semibold tracking-[0.38em] uppercase text-[#ff4b4e]">Richiesta di adesione</div>
          <h2 className="mx-auto mt-6 max-w-5xl text-[clamp(3rem,8vw,7.5rem)] font-black leading-[0.86] tracking-[-0.06em] uppercase">
            Entra nel racconto.
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-white/65 md:text-lg">
            Entrare nella LV PEOPLE significa condividere un’attitudine, non acquistare un privilegio.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/become-member?from=/society"
              className="group inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-[10px] font-semibold tracking-[0.22em] uppercase text-black transition hover:bg-[#ff4b4e]"
            >
              Entra in LV People
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <a
              href="mailto:info@ledvelvet.it?subject=Richiesta%20Adesione%20Led%20Velvet%20Society"
              className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-7 py-3.5 text-[10px] font-semibold tracking-[0.22em] uppercase text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Contatta lo staff
            </a>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-xs leading-6 text-white/38">
            L’adesione avviene tramite piattaforma dedicata. Una volta completata, entrerai ufficialmente nella community LV PEOPLE.
          </p>
        </div>
      </section>

      <footer className="relative mx-auto max-w-7xl px-5 py-12 md:px-10">
        <div className="flex flex-col gap-4 border-t border-white/10 pt-7 text-[9px] tracking-[0.28em] uppercase text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} LEDVELVET</span>
          <span>Associazione culturale · Toscana</span>
        </div>
      </footer>
    </main>
  );
}
