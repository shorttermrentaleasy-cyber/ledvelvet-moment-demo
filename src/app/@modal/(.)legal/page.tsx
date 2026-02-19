"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LegalModalPage() {
  const router = useRouter();

  function closeModal() {
    // ✅ chiude davvero lo slot @modal
    router.back();

    // 🔒 fallback: se Legal è stato aperto direttamente (senza pagina dietro nello stack)
    // allora back potrebbe non tornare a /moment2
    window.setTimeout(() => {
      if (window.location.pathname !== "/moment2") {
        router.replace("/moment2");
      }
    }, 120);
  }

  return (
    <div>
      {/* topbar */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div>
          <div className="text-sm text-white/60">LED VELVET ETS</div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-white">
            Legal & Transparency
          </h1>
        </div>

        {/* ✅ CHIUDI: back (chiude il modal) + fallback */}
        <button
          type="button"
          onClick={closeModal}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
        >
          Chiudi
        </button>
      </div>

      {/* body */}
      <div className="px-6 py-8 md:px-10 md:py-10">
        <p className="text-white/65 max-w-2xl mb-10">
          Documentazione legale e istituzionale relativa a LED VELVET ETS.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <Card href="/privacy" title="Privacy Policy" desc="Informativa sul trattamento dei dati personali (GDPR)." />
          <Card href="/cookie-policy" title="Cookie Policy" desc="Informazioni sui cookie utilizzati dal sito." />
          <Card href="/termini" title="Termini di Utilizzo" desc="Condizioni di utilizzo del sito ledvelvet.it." />
          <Card href="/trasparenza" title="Trasparenza ETS" desc="Documenti ufficiali, Statuto e iscrizione RUNTS." />
        </div>

        <div className="mt-10 text-sm text-white/55 border-t border-white/10 pt-6">
          <div>CF: 90072950505</div>
          <a className="underline hover:text-white transition" href="mailto:privacy@ledvelvet.it">
            privacy@ledvelvet.it
          </a>
        </div>
      </div>
    </div>
  );
}

function Card({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group relative border border-white/10 bg-white/5 backdrop-blur-md rounded-2xl p-6 transition hover:border-fuchsia-500 hover:bg-white/10"
    >
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition bg-gradient-to-br from-fuchsia-600/10 to-purple-600/10" />
      <div className="relative z-10">
        <h2 className="text-lg md:text-xl font-semibold mb-2 text-white group-hover:text-fuchsia-300 transition">
          {title}
        </h2>
        <p className="text-white/60 text-sm">{desc}</p>
      </div>
    </Link>
  );
}