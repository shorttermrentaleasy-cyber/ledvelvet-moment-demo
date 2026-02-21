export const metadata = {
  title: "Cookie Policy – Led Velvet ETS",
  description: "Informazioni sui cookie utilizzati dal sito ledvelvet.it",
};

export default function CookiePolicyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      {/* Velvet background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0018] to-black" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-purple-900/25 blur-[170px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[640px] h-[640px] bg-fuchsia-800/15 blur-[210px] rounded-full" />

      <article className="relative z-10 px-6 py-24 max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-bold mb-6">
          Cookie Policy
        </h1>

        <p className="text-gray-400 mb-10">
          Questa pagina descrive l’uso dei cookie e di tecnologie simili sul sito ledvelvet.it.
        </p>

        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-a:text-fuchsia-300">

          <h2>1) Cosa sono i cookie</h2>
          <p>
            I cookie sono piccoli file di testo che i siti web possono salvare sul dispositivo dell’utente
            per migliorare l’esperienza di navigazione e abilitare funzioni tecniche.
          </p>

          <h2>2) Cookie utilizzati dal sito</h2>
          <p>
            Il sito utilizza principalmente <strong>cookie tecnici</strong> necessari al corretto funzionamento,
            alla sicurezza e alla gestione della navigazione.
          </p>

          <h3>Cookie tecnici (necessari)</h3>
          <ul>
            <li>gestione sessione e funzionalità essenziali;</li>
            <li>sicurezza e prevenzione abusi;</li>
            <li>corretto funzionamento della piattaforma.</li>
          </ul>

          <h2>3) Cookie di profilazione / marketing</h2>
          <p>
            <strong>Al momento il sito non utilizza cookie di profilazione</strong> o strumenti di tracciamento
            pubblicitario attivi all’apertura (es. pixel marketing o analytics con profilazione).
          </p>
          <p>
            Qualora in futuro venissero introdotti strumenti di tracciamento non tecnici, verrà mostrato un banner
            di consenso prima dell’attivazione.
          </p>

          <h2>4) Link a servizi esterni (social e piattaforme terze)</h2>
          <p>
            Sul sito possono essere presenti link a piattaforme esterne (es. Instagram, TikTok, Telegram, YouTube).
            <strong> I link esterni non installano cookie di terze parti finché l’utente non clicca</strong> e
            non visita il sito esterno.
          </p>
          <p>
            L’eventuale trattamento dei dati da parte delle piattaforme esterne è regolato dalle rispettive
            informative privacy/cookie dei relativi fornitori.
          </p>

          <h2>5) Gestione dei cookie dal browser</h2>
          <p>
            L’utente può gestire o disabilitare i cookie tramite le impostazioni del proprio browser.
            La disabilitazione dei cookie tecnici può compromettere alcune funzionalità del sito.
          </p>

          <h2>6) Contatti</h2>
          <p>
            Per informazioni: <a href="mailto:privacy@ledvelvet.it">privacy@ledvelvet.it</a>.
          </p>

          <p className="text-gray-500">
            Ultimo aggiornamento: Marzo/2026
          </p>

        </div>
      </article>
    </main>
  );
}
