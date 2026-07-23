"use client";

import { useEffect, useState } from "react";

const AUTH_EVENT_KEY = "lv_auth_completed_at";

export default function AuthCompletePage() {
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    const completedAt = String(Date.now());

    try {
      localStorage.setItem(AUTH_EVENT_KEY, completedAt);
      const channel = new BroadcastChannel("ledvelvet-auth");
      channel.postMessage({ type: "authenticated", completedAt });
      channel.close();
    } catch {}

    const closeTimer = window.setTimeout(() => {
      window.close();
      setCanClose(true);
    }, 350);

    return () => window.clearTimeout(closeTimer);
  }, []);

  return (
    <main className="min-h-screen bg-black text-white grid place-items-center px-6">
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white/[0.04] p-8 text-center shadow-[0_28px_90px_rgba(0,0,0,0.72)]">
        <div className="text-[11px] tracking-[0.26em] uppercase text-white/50">LedVelvet Access</div>
        <h1 className="mt-3 text-2xl font-semibold">Accesso completato</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          La pagina LedVelvet già aperta è stata aggiornata.
        </p>
        {canClose ? (
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 h-11 rounded-2xl bg-[#930b0c] px-6 text-xs font-semibold tracking-[0.18em] uppercase text-black hover:opacity-90"
          >
            Chiudi questa scheda
          </button>
        ) : null}
        <a
          href="/"
          className="mt-4 block text-xs tracking-[0.16em] uppercase text-white/45 hover:text-white"
        >
          Torna a LedVelvet
        </a>
      </section>
    </main>
  );
}
