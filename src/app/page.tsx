export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl md:text-5xl font-bold">LedVelvet – MVP locale</h1>
        <p className="mt-4 opacity-80">
          Questa è una build locale per provare la navigazione e la UI. Scegli una demo:
        </p>

        <div className="mt-10 grid md:grid-cols-2 gap-4">
          <a className="rounded-2xl border border-white/15 bg-white/5 p-6 hover:bg-white/10" href="/moment">
            <div className="text-sm uppercase tracking-widest opacity-70">UI / Mockup</div>
            <div className="mt-2 text-2xl font-semibold">Cercle “Moment” style</div>
            <div className="mt-2 text-sm opacity-70">Hero video, card eventi con video, membership, shop, tessera.</div>
          </a>

          <a className="rounded-2xl border border-white/15 bg-white/5 p-6 hover:bg-white/10" href="/demo">
            <div className="text-sm uppercase tracking-widest opacity-70">UI / Demo</div>
            <div className="mt-2 text-2xl font-semibold">Live demo (dark)</div>
            <div className="mt-2 text-sm opacity-70">Versione alternativa scura con shop + membership + area socio.</div>
          </a>
        </div>

        <div className="mt-10 text-sm opacity-70">
          Video hero locale: <code className="opacity-90">public/media/petra_led.mp4</code>
        </div>
      </div>
    </main>
  );
}
