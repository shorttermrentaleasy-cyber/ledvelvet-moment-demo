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
  // allow only internal paths like "/moment2?x=1"
  if (!p) return null;
  if (!p.startsWith("/")) return null;
  if (p.startsWith("//")) return null;
  if (p.includes("://")) return null;
  return p;
}

export default function SocietyPage({ searchParams }: Props) {
  const fromRaw = firstParam(searchParams?.from);
  const from = sanitizeInternalPath(fromRaw || "") || "/moment2";

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-[#EDEDED]">
      {/* Top bar */}
      <div className="sticky top-0 z-[200] border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link
            href={from}
            className="text-sm px-3 py-1.5 rounded-xl border border-[var(--red-acc)]/35 bg-[var(--red-acc)]/10 text-white/85 hover:bg-[var(--red-acc)]/15 hover:border-[var(--red-acc)]/55 transition"
          >
            ← Torna indietro
          </Link>

          <div className="text-[11px] tracking-[0.22em] uppercase text-white/60">
            LV · PEOPLE
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative border-b border-white/10">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_10%,rgba(147,11,12,0.18),transparent_45%),radial-gradient(circle_at_80%_40%,rgba(255,255,255,0.07),transparent_55%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-12 md:py-16">
          <p className="text-xs tracking-[0.22em] uppercase text-white/60">
            Comunità · Membership · Appartenenza
          </p>
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight">
            LV PEOPLE
          </h1>
          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/80 leading-relaxed">
            Una comunità curata, non un semplice accesso. <br />
            LV PEOPLE non è una tessera. Non è un abbonamento. È un modo di
            appartenere.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#richiesta"
              className="inline-flex items-center rounded-full border border-white/20 bg-white text-black px-5 py-2 text-xs tracking-[0.22em] uppercase hover:opacity-90"
            >
              Entra in LV PEOPLE
            </a>

            {/* torna agli eventi MA rispettando sempre "from" */}
            <Link
              href={from}
              className="inline-flex items-center rounded-full border border-[var(--red-acc)]/35 bg-[var(--red-acc)]/10 px-5 py-2 text-xs tracking-[0.22em] uppercase text-white/85 hover:bg-[var(--red-acc)]/15 hover:border-[var(--red-acc)]/55"
            >
              Torna all’esperienza
            </Link>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-5xl px-4 py-10 md:py-14 grid gap-10">
        {/* What is */}
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Cos’è LV PEOPLE</h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            LV PEOPLE riunisce persone che si riconoscono nell’identità e
            nella visione dell’associazione. È una comunità costruita sulla presenza,
            non sui numeri. Chi ne fa parte non “partecipa soltanto”: entra a far
            parte del racconto.
          </p>
          <p className="mt-4 text-white/85 leading-relaxed">
            Ogni capitolo nasce con un’intenzione precisa: musica, spazio e atmosfera
            si incontrano per creare un’esperienza che rimane. La Society esiste per
            accompagnare questo percorso nel tempo.
          </p>
        </article>

        {/* Benefits */}
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Cosa offre la Society</h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            Senza promesse commerciali, senza meccaniche forzate. La Society è
            riconoscimento e continuità.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                Accesso
              </div>
              <div className="mt-2 text-white/85 leading-relaxed">
                Accesso prioritario a eventi selezionati e comunicazioni anticipate.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                Inviti
              </div>
              <div className="mt-2 text-white/85 leading-relaxed">
                Inviti riservati a capitoli specifici del percorso Led Velvet.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                Contenuti
              </div>
              <div className="mt-2 text-white/85 leading-relaxed">
                Contenuti curatoriali e materiali dedicati oltre la singola serata.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                Esperienze
              </div>
              <div className="mt-2 text-white/85 leading-relaxed">
                Esperienze pensate “oltre l’evento”: continuità, qualità, dettagli.
              </div>
            </div>
          </div>
        </article>

        {/* How it works */}
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Come funziona</h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            La Society segue i principi e il ciclo annuale dell’associazione. La
            richiesta di adesione può essere effettuata in qualsiasi momento; la
            conferma avviene secondo criteri interni e nel rispetto delle regole
            associative.
          </p>
          <p className="mt-4 text-white/85 leading-relaxed">
            Alcuni capitoli sono aperti. Altri sono riservati a chi fa parte della
            community.
          </p>
        </article>

        {/* Society & events */}
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Society ed eventi</h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            In alcuni eventi Led Velvet, la Community LV PEOPLE può includere momenti dedicati:
            accessi anticipati, inviti riservati o capitoli aggiuntivi dell’esperienza.
          </p>
          <p className="mt-4 text-white/85 leading-relaxed">
            Non vengono annunciati in modo esplicito. Si scoprono lungo il percorso.
          </p>
        </article>

        {/* Request */}
        <article
          id="richiesta"
          className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8"
        >
          <h2 className="text-2xl font-semibold">Richiesta di adesione</h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            Entrare nella LV PEOPLE significa condividere un’attitudine,
            non acquistare un privilegio.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="mailto:info@ledvelvet.it?subject=Richiesta%20Adesione%20Led%20Velvet%20Society"
              className="inline-flex items-center rounded-full border border-white/20 bg-white text-black px-5 py-2 text-xs tracking-[0.22em] uppercase hover:opacity-90"
            >
              Invia richiesta via email
            </a>

            <Link
              href={from}
              className="inline-flex items-center rounded-full border border-[var(--red-acc)]/35 bg-[var(--red-acc)]/10 px-5 py-2 text-xs tracking-[0.22em] uppercase text-white/85 hover:bg-[var(--red-acc)]/15 hover:border-[var(--red-acc)]/55"
            >
              Torna all’esperienza
            </Link>
          </div>

          <p className="mt-6 text-xs text-white/60 leading-relaxed">
            Nota: LV PEOPLE opera all’interno del quadro statutario
            dell’associazione e ne rispetta valori, regole e struttura annuale.
          </p>
        </article>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-5xl px-4 text-xs text-white/50">
          © {new Date().getFullYear()} Led Velvet — Associazione culturale
        </div>
      </footer>
    </main>
  );
}
