export const metadata = {
  title: "Privacy Policy – Led Velvet ETS",
  description: "Informativa sul trattamento dei dati personali (GDPR)",
};

import LegalTopbar from "@/components/legal/LegalTopbar";

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      <LegalTopbar homeHref="/moment2" label="Privacy Policy" />

      {/* Velvet background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0018] to-black" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-purple-900/25 blur-[170px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[640px] h-[640px] bg-fuchsia-800/15 blur-[210px] rounded-full" />

      <article className="relative z-10 px-6 py-24 max-w-4xl mx-auto">

        <h1 className="text-3xl md:text-5xl font-bold mb-6">
          Privacy Policy
        </h1>

        <p className="text-gray-400 mb-10">
          Informativa sul trattamento dei dati personali ai sensi dell’art. 13 del Regolamento (UE) 2016/679 (“GDPR”).
        </p>

        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-a:text-fuchsia-300">

          <h2>1) Titolare del trattamento</h2>
          <p>
            Il Titolare del trattamento è <strong>LED VELVET ETS</strong> (CF 90072950505).
            <br />
            Email di contatto:{" "}
            <a href="mailto:privacy@ledvelvet.it">privacy@ledvelvet.it</a>.
          </p>

          <h2>2) Tipologia di dati trattati</h2>
          <ul>
            <li>Dati identificativi e di contatto forniti volontariamente (es. nome, email, telefono).</li>
            <li>Dati contenuti nei messaggi inviati tramite form (es. richieste sponsor).</li>
            <li>Dati tecnici di navigazione necessari al funzionamento e sicurezza del sito (log, IP, timestamp).</li>
          </ul>
          <p>
            Il sito non è destinato alla raccolta di categorie particolari di dati (art. 9 GDPR). 
            Si invita a non inserire informazioni sanitarie o sensibili nei moduli.
          </p>

          <h2>3) Finalità del trattamento</h2>
          <ul>
            <li>Rispondere alle richieste inviate tramite form contatti/sponsor.</li>
            <li>Gestire il rapporto associativo (quando attivato il tesseramento).</li>
            <li>Garantire sicurezza e corretto funzionamento della piattaforma.</li>
            <li>Invio newsletter (solo se attivata e previo consenso).</li>
          </ul>

          <h2>4) Base giuridica</h2>
          <ul>
            <li>Art. 6(1)(b) GDPR – Esecuzione di misure precontrattuali o rapporto associativo.</li>
            <li>Art. 6(1)(f) GDPR – Legittimo interesse del Titolare (sicurezza e gestione tecnica).</li>
            <li>Art. 6(1)(a) GDPR – Consenso per eventuale newsletter.</li>
            <li>Art. 6(1)(c) GDPR – Adempimento di obblighi di legge, ove applicabile.</li>
          </ul>

          <h2>5) Biglietteria eventi (Xceed)</h2>
          <p>
            Per la gestione della biglietteria degli eventi, LED VELVET ETS può avvalersi della piattaforma <strong>Xceed</strong>, 
            che opera quale titolare autonomo per le attività di vendita e gestione pagamenti.
          </p>
          <p>
            L’Associazione può ricevere dati minimi (es. nominativo o codice biglietto) esclusivamente per 
            finalità organizzative e controllo accessi agli eventi riservati ai soci.
          </p>

          <h2>6) Tesseramento e tessere digitali</h2>
          <p>
            La gestione del tesseramento può avvenire tramite piattaforme dedicate (es. Wallyfor). 
            I dati sono trattati esclusivamente per finalità connesse al rapporto associativo.
          </p>

          <h2>7) Fornitori tecnici e destinatari</h2>
          <p>
            Il sito utilizza fornitori esterni per servizi tecnici e digitali:
          </p>
          <ul>
            <li>Supabase – Database e backend.</li>
            <li>Vercel – Hosting applicativo.</li>
            <li>Airtable – Gestione database operativo (es. richieste sponsor).</li>
            <li>Aruba – Gestione dominio, DNS e posta elettronica.</li>
          </ul>
          <p>
            Tali soggetti operano come responsabili del trattamento ai sensi dell’art. 28 GDPR o come autonomi titolari per specifici servizi.
          </p>

          <h2>8) Trasferimenti extra UE</h2>
          <p>
            Qualora i fornitori trattino dati al di fuori dello Spazio Economico Europeo, 
            il trattamento avviene nel rispetto delle garanzie previste dal GDPR (es. clausole contrattuali standard).
          </p>

          <h2>9) Periodo di conservazione</h2>
          <ul>
            <li>Dati da form: per il tempo necessario a gestire la richiesta.</li>
            <li>Dati associativi: per la durata del rapporto e obblighi di legge.</li>
            <li>Log tecnici: per finalità di sicurezza e prevenzione abusi.</li>
            <li>Newsletter: fino a revoca del consenso.</li>
          </ul>

          <h2>10) Diritti dell’interessato</h2>
          <p>
            L’interessato può esercitare i diritti previsti dagli artt. 15–22 GDPR 
            (accesso, rettifica, cancellazione, limitazione, opposizione, portabilità ove applicabile) 
            scrivendo a{" "}
            <a href="mailto:privacy@ledvelvet.it">privacy@ledvelvet.it</a>.
          </p>

<div className="mt-12 p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
  <h3 className="text-lg font-semibold mb-3 text-white">
    Informativa Area Tesseramento
  </h3>

  <p className="text-gray-400 text-sm mb-4">
    L'informativa completa relativa al sistema di tesseramento digitale
    (piattaforma Wally) è disponibile nel documento dedicato.
  </p>

  <a
    href="/docs/INFORMATIVA_PRIVACY_TESSERAMENTO.pdf"
    target="_blank"
    rel="noreferrer"
    className="inline-block px-5 py-2 rounded-full border border-white/20 bg-white/10 text-sm hover:bg-white/20 transition"
  >
    Scarica informativa completa (PDF)
  </a>
</div>
          <p>
            È possibile proporre reclamo al Garante per la protezione dei dati personali.
          </p>

          <p className="text-gray-500">
            Ultimo aggiornamento: Marzo/2026
          </p>

        </div>
      </article>
    </main>
  );
}
