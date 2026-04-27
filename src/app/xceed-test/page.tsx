"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";

export default function XceedTestPage() {
  const router = useRouter();

  const testMember = {
    firstName: "Lamberto",
    lastName: "Test",
    email: "test@ledvelvet.it",
    phone: "3330000000",
    idNumber: "LVTEST001",
  };

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function copyAll() {
    const values = [
      testMember.firstName,
      testMember.lastName,
      testMember.email,
      testMember.email,
      testMember.phone,
      testMember.idNumber,
    ];

    await navigator.clipboard.writeText(values.join("\t"));
  }

  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <section className="relative overflow-hidden px-5 py-10 md:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,38,255,0.25),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.22),transparent_35%)]" />

        <div className="relative mx-auto max-w-5xl">
          {/* BACK */}
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm backdrop-blur transition hover:bg-white/10"
            >
              ← Torna indietro
            </button>
          </div>

          {/* HEADER */}
          <div className="mb-8">
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/50">
              LedVelvet Tickets
            </p>

            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Xceed Ticket Test
            </h1>

            <p className="mt-4 max-w-2xl text-base text-white/65 md:text-lg">
              Copia i dati socio e inseriscili nel form Xceed.
            </p>
          </div>

          {/* COPY ALL */}
          <button
            onClick={copyAll}
            className="mb-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Copia tutti i dati (auto-fill test)
          </button>

          {/* DATA BOX */}
          <div className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <p className="mb-4 text-xs uppercase tracking-[0.25em] text-white/40">
              Dati socio
            </p>

            <div className="grid gap-3">
              {[
                ["Nome", testMember.firstName],
                ["Cognome", testMember.lastName],
                ["Email", testMember.email],
                ["Telefono", testMember.phone],
                ["ID NUMBER", testMember.idNumber],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                      {label}
                    </div>
                    <div className="text-sm text-white/85">{value}</div>
                  </div>

                  <button
                    onClick={() => copy(value)}
                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20"
                  >
                    Copia
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* WIDGET */}
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