import Link from "next/link";
import LegalTopbar from "@/components/legal/LegalTopbar";

export const metadata = {
  title: "Legal – Led Velvet ETS",
  description: "Documentazione legale e informativa di Led Velvet ETS",
};

export default function LegalPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <LegalTopbar homeHref="/moment2" label="Legal" />

      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0018] to-black" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-purple-900/25 blur-[170px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[640px] h-[640px] bg-fuchsia-800/15 blur-[210px] rounded-full" />

      <div className="relative z-10 px-6 py-24 max-w-5xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Legal & Transparency
        </h1>

        <p className="text-gray-400 max-w-2xl mb-14">
          Qui trovi le pagine legali e istituzionali di LED VELVET ETS.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <LegalCard
            title="Privacy Policy"
            description="Informativa sul trattamento dei dati personali (GDPR)."
            href="/privacy"
          />

          <LegalCard
            title="Cookie Policy"
            description="Informazioni sui cookie utilizzati dal sito."
            href="/cookie-policy"
          />

          <LegalCard
            title="Termini di Utilizzo"
            description="Condizioni di utilizzo del sito ledvelvet.it."
            href="/termini"
          />

          <LegalCard
            title="Trasparenza ETS"
            description="Documenti ufficiali, Statuto e iscrizione RUNTS."
            href="/trasparenza"
          />

          {/* ✅ NUOVA: PDF in /public/docs → URL pubblico /docs/... */}
          <LegalCard
            title="Privacy Area Tesseramento"
            description="Informativa relativa al tesseramento digitale (Wally) e gestione soci."
            href="/docs/INFORMATIVA_PRIVACY_TESSERAMENTO.pdf"
            newTab
          />
        </div>

        <div className="mt-20 border-t border-white/10 pt-6 text-sm text-gray-500">
          <p>LED VELVET ETS – CF 90072950505</p>
          <a
            href="mailto:privacy@ledvelvet.it"
            className="underline hover:text-white transition"
          >
            privacy@ledvelvet.it
          </a>
        </div>
      </div>
    </main>
  );
}

function LegalCard({
  title,
  description,
  href,
  newTab = false,
}: {
  title: string;
  description: string;
  href: string;
  newTab?: boolean;
}) {
  return (
    <Link
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      className="group relative border border-white/10 bg-white/5 backdrop-blur-md rounded-2xl p-8 transition hover:border-fuchsia-500 hover:bg-white/10"
    >
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition bg-gradient-to-br from-fuchsia-600/10 to-purple-600/10" />
      <div className="relative z-10">
        <h2 className="text-2xl font-semibold mb-3 tracking-tight group-hover:text-fuchsia-400 transition">
          {title}
        </h2>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </Link>
  );
}