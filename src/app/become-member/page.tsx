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

const benefits = [
  {
    number: "01",
    label: "Community",
    body: "Entri a far parte dell’associazione LEDVELVET e della sua community.",
  },
  {
    number: "02",
    label: "Attività",
    body: "Puoi partecipare alle iniziative e alle attività riservate ai soci, secondo le regole associative.",
  },
  {
    number: "03",
    label: "Tessera digitale",
    body: "Ricevi una tessera personale digitale, gestibile anche dal tuo Wallet.",
  },
];

export default function BecomeMemberPage({ searchParams }: Props) {
  const fromRaw = firstParam(searchParams?.from);
  const from = sanitizeInternalPath(fromRaw);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_82%_10%,rgba(147,11,12,0.28),transparent_34%),radial-gradient(circle_at_9%_72%,rgba(147,11,12,0.12),transparent_32%)]" />
      <div className="fixed inset-0 pointer-events-none opacity-[0.028] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:76px_76px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-10">
          <Link
            href={from}
            className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] uppercase text-white/65 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Indietro
          </Link>

          <div className="text-[10px] font-semibold tracking-[0.32em] uppercase text-white/45">
            LV · PEOPLE
          </div>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100svh-73px)] max-w-7xl items-end px-5 pb-16 pt-24 md:px-10 md:pb-24 md:pt-32">
        <div className="absolute right-[-0.08em] top-5 select-none text-[clamp(8rem,28vw,25rem)] font-black leading-none tracking-[-0.1em] text-white/[0.025]">
          JOIN
        </div>

        <div className="relative w-full">
          <div className="mb-10 flex items-center gap-4 text-[9px] font-semibold tracking-[0.38em] uppercase text-[#ff4b4e] md:mb-14">
            <span className="h-px w-12 bg-[#930b0c]" />
            Adesione · Community · Appartenenza
          </div>

          <h1 className="max-w-6xl text-[clamp(4rem,12vw,10.5rem)] font-black leading-[0.79] tracking-[-0.075em] uppercase">
            <span className="block text-white">Entra in</span>
            <span className="block text-white/20">LV People</span>
          </h1>

          <div className="mt-12 grid items-end gap-10 md:mt-16 md:grid-cols-[0.8fr_1.2fr]">
            <div className="hidden text-[9px] tracking-[0.3em] uppercase text-white/30 md:block">
              MUSIC / PLACES / COMMUNITY
            </div>
            <div>
              <p className="max-w-2xl border-l border-[#930b0c] pl-5 text-lg leading-8 text-white/72 md:pl-7 md:text-2xl md:leading-10">
                Entra nella community LEDVELVET, partecipa alle attività associative e ricevi la tua tessera digitale personale.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={WALLY_JOIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-[10px] font-semibold tracking-[0.22em] uppercase text-black transition hover:bg-[#ff4b4e]"
                >
                  Unisciti a LV People
                  <span className="transition-transform group-hover:translate-x-1">↗</span>
                </a>
                <a
                  href="#come-funziona"
                  className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-7 py-3.5 text-[10px] font-semibold tracking-[0.22em] uppercase text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Scopri come funziona
                </a>
              </div>
            </div>
          </div>

          <a
            href="#perche"
            className="mt-14 inline-flex items-center gap-3 text-[9px] font-semibold tracking-[0.28em] uppercase text-white/40 transition hover:text-white md:mt-20"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15">↓</span>
            Continua
          </a>
        </div>
      </section>

      <section id="perche" className="relative overflow-hidden border-y border-white/10 bg-[#930b0c]/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(147,11,12,0.55),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <div className="text-center text-[9px] font-semibold tracking-[0.36em] uppercase text-[#ff6b6e]">
            Cosa significa entrare
          </div>
          <h2 className="mx-auto mt-5 max-w-4xl text-center text-3xl font-black tracking-[-0.04em] md:text-5xl">
            Non una semplice tessera. Un modo per farne parte.
          </h2>

          <div className="mt-14 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-3">
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
        <div className="grid gap-14 md:grid-cols-[0.75fr_1.25fr] md:gap-20">
          <div>
            <div className="text-[9px] font-semibold tracking-[0.34em] uppercase text-[#ff4b4e]">
              Essere socio
            </div>
            <h2 className="mt-4 text-[clamp(2.8rem,6vw,6rem)] font-black leading-[0.88] tracking-[-0.055em] uppercase">
              Sostieni una visione.
              <span className="block text-white/18">Non compri una quota.</span>
            </h2>
          </div>

          <div className="space-y-7 text-base leading-8 text-white/65 md:text-lg md:leading-9">
            <p>
              Diventare socio significa aderire all’associazione e sostenerne le attività.
            </p>
            <p className="text-white/85">
              Non significa diventare proprietario di LEDVELVET, acquistare quote della società o avere diritto agli utili.
            </p>
            <div className="border-l border-[#930b0c] pl-5 text-sm leading-7 text-white/50 md:pl-7">
              L’adesione segue le regole associative e il ciclo annuale dell’associazione.
            </div>
          </div>
        </div>
      </section>

      <section id="come-funziona" className="relative overflow-hidden border-y border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(147,11,12,0.22),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 text-center md:px-10 md:py-36">
          <div className="text-[9px] font-semibold tracking-[0.38em] uppercase text-[#ff4b4e]">
            Come funziona
          </div>
          <h2 className="mx-auto mt-6 max-w-5xl text-[clamp(3rem,8vw,7.3rem)] font-black leading-[0.86] tracking-[-0.06em] uppercase">
            Il prossimo passo è tuo.
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-white/65 md:text-lg">
            Apri la piattaforma ufficiale Wallyfor, compila i tuoi dati e completa l’adesione tramite Stripe. La tessera sarà creata direttamente da Wallyfor: LEDVELVET non gestisce i dati della carta.
          </p>

          <div className="mt-10">
            <a
              href={WALLY_JOIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-[10px] font-semibold tracking-[0.22em] uppercase text-black transition hover:bg-[#ff4b4e]"
            >
              Unisciti a LV People
              <span className="transition-transform group-hover:translate-x-1">↗</span>
            </a>
          </div>

          <p className="mx-auto mt-5 max-w-xl text-xs leading-6 text-white/38">
            Richiesta e pagamento sicuro si apriranno in una nuova scheda.
          </p>
        </div>
      </section>

      <footer className="relative mx-auto max-w-7xl px-5 py-12 md:px-10">
        <div className="flex flex-col gap-5 border-t border-white/10 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={from}
            className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] uppercase text-white/60 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Torna alla pagina precedente
          </Link>
          <div className="text-[9px] tracking-[0.28em] uppercase text-white/35">
            Adesione ufficiale tramite Wallyfor · Stripe
          </div>
        </div>
      </footer>
    </main>
  );
}
