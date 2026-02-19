export const metadata = {
  title: "Termini di utilizzo – Led Velvet ETS",
  description: "Condizioni di utilizzo del sito ledvelvet.it",
};

import LegalTopbar from "@/components/legal/LegalTopbar";

export default function TerminiPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      <LegalTopbar homeHref="/moment2" label="Termini di Utilizzo" />

      {/* Velvet background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0018] to-black" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-purple-900/25 blur-[170px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[640px] h-[640px] bg-fuchsia-800/15 blur-[210px] rounded-full" />

      <article className="relative z-10 px-6 py-24 max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-bold mb-6">
          Termini di Utilizzo
        </h1>

        <p className="text-gray-400 mb-10">
          Le presenti condizioni disciplinano l’uso del sito ledvelvet.it (“Sito”).
          Accedendo o utilizzando il Sito, l’utente accetta i presenti Termini.
        </p>

        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-a:text-fuchsia-300">

          <h2>1) Titolare del sito</h2>
          <p>
            Il Sito è gestito da <strong>LED VELVET ETS</strong> (CF 90072950505).
            Contatti: <a href="mailto:privacy@ledvelvet.it">privacy@ledvelvet.it</a>.
          </p>

          <h2>2) Finalità del sito</h2>
          <p>
            Il Sito ha finalità informativa e può includere contenuti relativi ad attività, eventi,
            iniziative e comunicazioni dell’Associazione.
          </p>

          <h2>3) Eventi e accesso riservato ai soci</h2>
          <p>
            Alcuni eventi o servizi possono essere riservati ai soci regolarmente iscritti.
            L’Associazione può adottare procedure di verifica della qualifica di socio e/o dei titoli
            di accesso (es. biglietto) per l’ingresso agli eventi.
          </p>

          <h2>4) Contenuti e proprietà intellettuale</h2>
          <p>
            Testi, grafiche, loghi, marchi e contenuti del Sito sono di proprietà di LED VELVET ETS
            o dei rispettivi titolari. È vietata la riproduzione, distribuzione o utilizzo dei contenuti
            senza autorizzazione, salvo quanto consentito dalla legge.
          </p>

          <h2>5) Link a siti terzi</h2>
          <p>
            Il Sito può contenere link verso siti o servizi di terze parti (es. social network,
            piattaforme di biglietteria). LED VELVET ETS non controlla tali siti e non è responsabile
            dei relativi contenuti, policy o pratiche.
          </p>

          <h2>6) Limitazione di responsabilità</h2>
          <p>
            LED VELVET ETS si impegna a mantenere aggiornate le informazioni pubblicate, ma non garantisce
            l’assenza di errori o interruzioni. L’Associazione non risponde per danni derivanti da
            malfunzionamenti dovuti a cause tecniche esterne o forza maggiore.
          </p>

          <h2>7) Modifiche ai Termini</h2>
          <p>
            LED VELVET ETS può aggiornare i presenti Termini in qualsiasi momento. La versione pubblicata
            sul Sito è quella vigente.
          </p>

          <h2>8) Legge applicabile</h2>
          <p>
            I presenti Termini sono regolati dalla legge italiana. Per quanto consentito, ogni controversia
            è devoluta al foro competente secondo legge.
          </p>

          <p className="text-gray-500">
            Ultimo aggiornamento: Marzo/2026
          </p>

        </div>
      </article>
    </main>
  );
}
