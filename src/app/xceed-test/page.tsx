import Script from "next/script";

export default function XceedTestPage() {
  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <section className="relative overflow-hidden px-5 py-10 md:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,38,255,0.25),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.22),transparent_35%)]" />

        <div className="relative mx-auto max-w-5xl">
          <div className="mb-8">
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/50">
              LedVelvet Tickets
            </p>

            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Get your access
            </h1>

            <p className="mt-4 max-w-2xl text-base text-white/65 md:text-lg">
              Acquista il tuo biglietto ufficiale tramite Xceed.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur md:p-6">
            <div id="xceed-widget" />
          </div>
        </div>
      </section>

      <Script
        src="https://widget.xceed.me/v2/loader.js"
        strategy="afterInteractive"
      />
    </main>
  );
}