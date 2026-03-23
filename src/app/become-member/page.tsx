import Link from "next/link";

export const dynamic = "force-dynamic";

const WALLY_IFRAME_URL =
  "https://wallyfor.com/iframepass/index.php?ref=1d7439beb34f751e1db481e40592079e&agenteget=";

type Props = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function sanitizeInternalPath(p: string | null): string {
  if (!p) return "/moment2#home";
  if (!p.startsWith("/")) return "/moment2#home";
  if (p.startsWith("//")) return "/moment2#home";
  if (p.includes("://")) return "/moment2#home";
  return p;
}

export default function BecomeMemberPage({ searchParams }: Props) {
  const fromRaw = firstParam(searchParams?.from);
  const from = sanitizeInternalPath(fromRaw);

  return (
    <main className="min-h-screen bg-[#050505] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#930b0c]/20 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-red-900/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href={from}
            className="inline-flex items-center rounded-full border border-white/15 bg-black/40 backdrop-blur px-4 py-2 text-xs tracking-[0.18em] uppercase text-white/80 hover:bg-white/10 hover:border-white/30 hover:text-white transition"
          >
            ← Indietro
          </Link>

          <div className="text-[10px] md:text-[11px] tracking-[0.24em] uppercase text-white/40">
            LedVelvet Society
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_30px_100px_rgba(0,0,0,0.55)] overflow-hidden">
          <div className="relative border-b border-white/10 px-5 md:px-8 py-6 md:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,11,12,0.22),transparent_40%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_35%)]" />

            <div className="relative">
              <div className="text-[11px] tracking-[0.24em] uppercase text-white/45">
                Adesione
              </div>

              <h1 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-white">
                Diventa socio
              </h1>

              <p className="mt-4 max-w-2xl text-sm md:text-base text-white/70 leading-relaxed">
                Entra nel cerchio LedVelvet e accedi al percorso di adesione.
                Completa qui sotto la tua registrazione attraverso la piattaforma dedicata.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] tracking-[0.18em] uppercase text-white/65">
                  Flusso ufficiale di adesione
                </div>
                <div className="inline-flex items-center rounded-full border border-[#930b0c]/30 bg-[#930b0c]/10 px-4 py-2 text-[11px] tracking-[0.18em] uppercase text-white/75">
                  Gestito con Wally
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-0">
            <div className="p-3 md:p-4 bg-black/20 border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="rounded-[22px] overflow-hidden border border-white/10 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <iframe
                  src={WALLY_IFRAME_URL}
                  title="LedVelvet Membership"
                  className="w-full bg-black"
                  style={{ height: "1170px", border: "0" }}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>

            <div className="bg-black/20 px-5 md:px-8 py-6 md:py-8">
              <div className="text-[11px] tracking-[0.22em] uppercase text-white/45">
                Informazioni
              </div>

              <h2 className="mt-3 text-xl md:text-2xl font-semibold text-white">
                Adesione e tessera digitale
              </h2>

              <p className="mt-4 text-sm md:text-base text-white/72 leading-relaxed">
                LedVelvet utilizza Wally come piattaforma operativa per la registrazione dei soci
                e la gestione della tessera. Questo significa che il percorso che completi qui
                fa parte del processo ufficiale di adesione.
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-white/45">
                    Registrazione
                  </div>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed">
                    Compila i tuoi dati attraverso il modulo Wally integrato per inviare la tua richiesta di adesione.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-white/45">
                    Tessera associativa
                  </div>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed">
                    Una volta approvata la richiesta, la tua tessera e il relativo flusso di accesso saranno gestiti nello stesso ecosistema.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-white/45">
                    Nota
                  </div>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed">
                    LV PEOPLE fa parte della struttura associativa dell’associazione. Accesso, validazione ed eventuali benefici futuri restano soggetti alle regole associative e al ciclo annuale.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <Link
                  href={from}
                  className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-xs tracking-[0.18em] uppercase text-white/80 hover:bg-white/10 hover:border-white/30 hover:text-white transition"
                >
                  Torna alla pagina precedente
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-5 md:px-8 py-4 bg-black/20">
            <div className="text-xs tracking-[0.18em] uppercase text-white/40">
              LedVelvet • Ethereal Clubbing
            </div>
            <div className="text-xs tracking-[0.18em] uppercase text-white/35">
              Flusso di adesione tramite Wally
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}