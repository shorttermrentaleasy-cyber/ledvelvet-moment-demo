"use client";

import React, { useEffect, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams?: { err?: string } }) {
  const palette = {
    bg: "#050505",
    surface: "#080808",
    surface2: "#0c0c0c",
    text: "#F5F5F5",
    muted: "rgba(245,245,245,0.70)",
    border: "rgba(255,255,255,0.10)",
    redDark: "#7d0d0e",
    redAccent: "#930b0c",
  } as const;

  const [csrfToken, setCsrfToken] = useState<string>("");
  const [email, setEmail] = useState("");
  const [loadingCsrf, setLoadingCsrf] = useState(true);

  const callbackUrl = "/login";
  const err = searchParams?.err || "";
  const nextAuthError = (searchParams as any)?.error || "";
  const isDenied = err === "not_allowed" || nextAuthError === "AccessDenied";

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        setCsrfToken(String(j?.csrfToken || ""));
      } catch {
        if (!alive) return;
        setCsrfToken("");
      } finally {
        if (!alive) return;
        setLoadingCsrf(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    const v = email.trim();
    return !!csrfToken && v.includes("@") && v.includes(".");
  }, [csrfToken, email]);

  return (
    <main
      className="min-h-screen isolate text-[var(--text)] selection:bg-[var(--red-accent)] selection:text-black"
      style={{
        ["--bg" as any]: palette.bg,
        ["--surface" as any]: palette.surface,
        ["--surface2" as any]: palette.surface2,
        ["--text" as any]: palette.text,
        ["--muted" as any]: palette.muted,
        ["--border" as any]: palette.border,
        ["--red-dark" as any]: palette.redDark,
        ["--red-accent" as any]: palette.redAccent,
        background: palette.bg,
      }}
    >
      {/* background glow + gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px circle at 50% 25%, rgba(147,11,12,0.28), transparent 62%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-black" />
      </div>

      <div className="relative z-10 px-6 py-10">
        <div className="max-w-md mx-auto">
          {/* top brand */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-white/10 bg-black/40 grid place-items-center overflow-hidden">
              <img src="/logo.png" alt="LedVelvet" className="w-10 h-10 object-contain opacity-90" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">LedVelvet</div>
              <div className="text-[11px] text-white/60 tracking-[0.26em] uppercase">Access</div>
            </div>
          </div>

          {/* card */}
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.60)]">
            {/* header stripe */}
            <div className="px-6 py-5 border-b border-white/10">
              <div className="text-[11px] tracking-[0.26em] uppercase text-white/70">Magic link</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Accedi con email</h1>
              <p className="mt-2 text-sm text-white/70">
                Inserisci la tua email: riceverai un link per entrare. Verrai reindirizzato automaticamente su{" "}
                <span className="text-white">Admin</span> o <span className="text-white">LV People</span>.
              </p>
            </div>

            <div className="px-6 py-6">

              {isDenied ? (
  <div className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
    <div
      className="px-5 py-4 border-b border-white/10"
      style={{
        background: "linear-gradient(90deg, rgba(147,11,12,0.35), rgba(0,0,0,0.25))",
      }}
    >
      <div className="text-[11px] tracking-[0.26em] uppercase text-white/70">Access denied</div>
      <div className="mt-2 text-lg font-semibold text-white">Not on the list.</div>
      <div className="mt-1 text-sm text-white/70">Questa email non è abilitata per entrare.</div>
    </div>

    <div className="px-5 py-4">
      <div className="text-xs text-white/60">
        Se pensi sia un errore: chiedi allo staff di aggiungerti come socio LV People (o di abilitarti come admin).
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/login"
          className="px-4 py-2 rounded-2xl bg-[var(--red-accent)] text-black text-xs tracking-[0.22em] uppercase font-semibold hover:opacity-90"
        >
          Riprova
        </a>
        <a
          href="/moment2"
          className="px-4 py-2 rounded-2xl border border-white/20 text-white text-xs tracking-[0.22em] uppercase hover:bg-white/10"
        >
          Torna a Moment
        </a>
      </div>
    </div>
  </div>
) : null}



              {loadingCsrf ? (
                <div className="text-sm text-white/70">Carico…</div>
              ) : !csrfToken ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                  Errore CSRF. Controlla che NextAuth sia attivo e che <span className="font-mono">/api/auth/csrf</span>{" "}
                  risponda.
                </div>
              ) : (
                <form method="post" action="/api/auth/signin/email" className="space-y-4">
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <input type="hidden" name="callbackUrl" value={callbackUrl} />

                  <label className="block text-xs tracking-[0.22em] uppercase text-white/70">Email</label>

                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40">
                      {/* mail icon */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4 6h16v12H4V6Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          opacity="0.9"
                        />
                        <path
                          d="M4.5 7l7.5 6 7.5-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          opacity="0.9"
                        />
                      </svg>
                    </div>

                    <input
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@dominio.com"
                      autoComplete="email"
                      inputMode="email"
                      className="
                        w-full h-11 pl-10 pr-3 text-sm text-white
                        rounded-2xl outline-none
                        border border-white/15 bg-black/35
                        focus:border-white/30 focus:bg-black/45
                      "
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={[
                      "w-full h-11 rounded-2xl text-xs tracking-[0.26em] uppercase font-semibold transition",
                      canSubmit
                        ? "bg-[var(--red-accent)] text-black hover:opacity-90"
                        : "bg-white/10 text-white/50 cursor-not-allowed",
                    ].join(" ")}
                  >
                    Invia link di accesso
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-[11px] tracking-[0.22em] uppercase text-white/60">Info</div>
                    <p className="mt-2 text-xs text-white/60">
                      1) Ricevi l’email · 2) Clicca il link · 3) Verrai reindirizzato automaticamente.
                    </p>
                  </div>
                </form>
              )}
            </div>

            {/* footer */}
            <div className="px-6 py-5 border-t border-white/10 bg-black/30">
              <p className="text-[11px] tracking-[0.22em] uppercase text-white/55">
                © {new Date().getFullYear()} LedVelvet
              </p>
            </div>
          </div>

          {/* micro link */}
          <div className="mt-6 text-center text-xs text-white/45">
            Se non hai richiesto l’accesso, ignora l’email.
          </div>
        </div>
      </div>
    </main>
  );
}
