export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold">LedVelvet</h1>
            <p className="mt-4 opacity-80">
              Scegli dove entrare: <b>Admin</b> (gestione eventi/sponsor) oppure <b>Sito pubblico</b> (Moment).
            </p>
          </div>

          <div className="hidden md:block text-right">
            <div className="text-xs uppercase tracking-widest opacity-60">Gateway</div>
            <div className="mt-1 text-sm opacity-75">admin + public</div>
          </div>
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-4">
          {/* ADMIN */}
          <a
            className="rounded-2xl border border-white/20 bg-white/10 p-6 hover:bg-white/15 transition"
            href="/admin/login"
          >
            <div className="text-sm uppercase tracking-widest opacity-70">Admin</div>
            <div className="mt-2 text-2xl font-semibold">Entra in Dashboard</div>
            <div className="mt-2 text-sm opacity-70">
              Login via email. Gestione Eventi, Sponsor (CRUD), e in futuro Soci.
            </div>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
              Vai a login <span aria-hidden>→</span>
            </div>
          </a>

          {/* PUBLIC */}
          <a
            className="rounded-2xl border border-white/15 bg-white/5 p-6 hover:bg-white/10 transition"
            <Link href="/moment2" as="/admin/moment2">
  		Sito
		</Link>

          >
            <div className="text-sm uppercase tracking-widest opacity-70">Sito pubblico</div>
            <div className="mt-2 text-2xl font-semibold">Apri “Moment2”</div>
            <div className="mt-2 text-sm opacity-70">
              Hero/video, eventi, esperienza “neon/dark”. Qui ci va il pubblico.
            </div>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
              Vai al sito <span aria-hidden>→</span>
            </div>
          </a>
        </div>

        <div className="mt-10 text-xs opacity-60 leading-relaxed">
          Suggerimento: quando attiviamo la <b>Gestione Soci</b>, la colleghiamo all’Admin (stessa login) con una sezione
          dedicata: anagrafica soci, tessere, pagamenti/quote, export.
        </div>
      </div>
    </main>
  );
}
