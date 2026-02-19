export const metadata = {
  title: "Trasparenza ETS – Led Velvet ETS",
  description: "Informazioni istituzionali e documenti ufficiali di LED VELVET ETS",
};

import LegalTopbar from "@/components/legal/LegalTopbar";
import Link from "next/link";

export default function TrasparenzaPage() {
  // TODO: quando carichi i PDF in /public/docs, aggiorna questi path
  const docs = {
    statuto: "/docs/STATUTO_FIRMATO.pdf",
    atto: "/docs/ATTO_COSTITUTIVO_FIRMATO.pdf",
    runts: "/docs/RUNTS_LEDVELVET.pdf",
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <LegalTopbar homeHref="/moment2" label="Trasparenza ETS" />

      {/* Velvet background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0018] to-black" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-purple-900/25 blur-[170px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[640px] h-[640px] bg-fuchsia-800/15 blur-[210px] rounded-full" />

      <article className="relative z-10 px-6 py-24 max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-bold mb-6">
          Trasparenza ETS
        </h1>

        <p className="text-gray-400 mb-10">
          Sezione informativa e documentale dedicata a <strong>LED VELVET ETS</strong>.
        </p>

        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-a:text-fuchsia-300">
          <h2>Dati essenziali</h2>
          <ul>
            <li><strong>Denominazione:</strong> LED VELVET ETS</li>
            <li><strong>Codice Fiscale:</strong> 90072950505</li>
            <li>
              <strong>Sede legale:</strong> Via Sandro Pertini 18/A – 56022 Castelfranco di Sotto (PI)
            </li>
            <li><strong>Iscrizione:</strong> Registro Unico Nazionale del Terzo Settore (RUNTS)</li>
            <li>
              <strong>Contatto:</strong>{" "}
              <a href="mailto:privacy@ledvelvet.it">privacy@ledvelvet.it</a>
            </li>
          </ul>

          <h2>Documenti ufficiali</h2>
          <p>
            Di seguito i documenti istituzionali principali. (Se un link non funziona, significa che il PDF non è ancora
            stato caricato nella cartella pubblica del sito.)
          </p>

          <div className="not-prose mt-6 grid gap-4">
            <DocCard
              title="Statuto (PDF)"
              href={docs.statuto}
              note="Documento statutario vigente firmato."
            />
            <DocCard
              title="Atto Costitutivo (PDF)"
              href={docs.atto}
              note="Atto costitutivo firmato."
            />
            <DocCard
              title="Iscrizione RUNTS (PDF)"
              href={docs.runts}
              note="Stampa/attestazione iscrizione RUNTS."
            />
          </div>

          <h2 className="mt-10">Bilanci e verbali</h2>
          <p>
            I bilanci e gli ulteriori atti di trasparenza saranno pubblicati nella presente sezione secondo gli obblighi
            previsti dalla normativa ETS e dagli adempimenti annuali dell’Associazione.
          </p>

          <p className="text-gray-500">
            Ultimo aggiornamento: Marzo/2026
          </p>

          <p className="text-gray-500">
            Torna all’indice: <Link href="/legal">/legal</Link>
          </p>
        </div>
      </article>
    </main>
  );
}

function DocCard({
  title,
  href,
  note,
}: {
  title: string;
  href: string;
  note: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 hover:bg-white/10 hover:border-fuchsia-500 transition"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-white font-semibold group-hover:text-fuchsia-300 transition">
            {title}
          </div>
          <div className="text-sm text-gray-400 mt-1">{note}</div>
        </div>
        <div className="text-gray-400 group-hover:text-white transition">↗</div>
      </div>
    </a>
  );
}
