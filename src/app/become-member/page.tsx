import Link from "next/link";

export const dynamic = "force-dynamic";

const WALLY_JOIN_URL =
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
                Entra in LV People
              </h1>

              <p className="mt-4 max-w-3xl text-sm md:text-base text-white/70 leading-relaxed">
                Entra nella community LEDVELVET, partecipa alle attività associative e ricevi
                la tua tessera digitale personale.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] tracking-[0.18em] uppercase text-white/65">
                  Tessera digitale
                </div>
                <div className="inline-flex items-center rounded-full border border-[#930b0c]/30 bg-[#930b0c]/10 px-4 py-2 text-[11px] tracking-[0.18em] uppercase text-white/75">
                  Adesione annuale
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 md:px-8 py-7 md:py-10">
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-white/45">
                    Community
                  </div>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed">
                    Entri a far parte dell’associazione LEDVELVET e della sua community.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-white/45">
                    Attività
                  </div>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed">
                    Puoi partecipare alle iniziative e alle attività riservate ai soci,
                    secondo le regole associative.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-white/45">
                    Tessera digitale
                  </div>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed">
                    Ricevi una tessera personale digitale, gestibile anche dal tuo Wallet.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#930b0c]/45 bg-[#930b0c]/15 p-5 md:p-6">
                <div className="text-[11px] tracking-[0.2em] uppercase text-red-200/80">
                  Cosa significa diventare socio
                </div>
                <p className="mt-3 text-sm md:text-base text-white/85 leading-relaxed">
                  Diventare socio significa aderire all’associazione e sostenerne le attività.
                  <strong className="font-semibold text-white">
                    {" "}Non significa diventare proprietario di LEDVELVET, acquistare quote
                    della società o avere diritto agli utili.
                  </strong>
                </p>
              </div>

              <div className="mt-7 rounded-[24px] border border-white/10 bg-black/35 p-5 md:p-7 text-center">
                <h2 className="text-xl md:text-2xl font-semibold text-white">
                  Unisciti alla community
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm md:text-base text-white/70 leading-relaxed">
                  Apri la piattaforma ufficiale Wallyfor, compila i tuoi dati e completa
                  l’adesione tramite Stripe. La tessera sarà creata direttamente
                  da Wallyfor: LEDVELVET non gestisce i dati della carta.
                </p>
                <a
                  href={WALLY_JOIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-[#930b0c] px-7 py-3.5 text-sm font-semibold tracking-wide text-white shadow-[0_12px_35px_rgba(147,11,12,0.35)] transition hover:bg-[#b10f11] hover:scale-[1.01]"
                >
                  Unisciti a LV People ↗
                </a>
                <p className="mt-3 text-xs text-white/45">
                  Richiesta e pagamento sicuro si apriranno in una nuova scheda.
                </p>
              </div>

              <div className="mt-7 text-center">
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
              Adesione ufficiale tramite Wallyfor
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}