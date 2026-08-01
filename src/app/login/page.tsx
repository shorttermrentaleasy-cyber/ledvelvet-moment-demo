"use client";

import React, { useMemo, useState } from "react";
import { signIn } from "next-auth/react";

export const dynamic = "force-dynamic";

type LoginSearchParams = {
  err?: string | string[];
  error?: string | string[];
  callbackUrl?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function safeCallbackUrl(value?: string | string[]) {
  const candidate = firstValue(value).trim();
  return candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/gate";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: LoginSearchParams;
}) {
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

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const callbackUrl = safeCallbackUrl(searchParams?.callbackUrl);
  const err = firstValue(searchParams?.err);
  const nextAuthError = firstValue(searchParams?.error);
  const isDenied = err === "not_allowed" || nextAuthError === "AccessDenied";
  const canSend = useMemo(
    () => isValidEmail(email) && !sending,
    [email, sending],
  );
  const canCheckCode = useMemo(
    () => isValidEmail(email) && code.length === 8 && !checkingCode,
    [email, code, checkingCode],
  );

  async function sendAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;

    setSending(true);
    setMessage(null);

    try {
      const result = await signIn("email", {
        email: email.trim(),
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setMessage(
          "Non è stato possibile inviare l’accesso. Controlla l’email o riprova.",
        );
        return;
      }

      setCode("");
      setSent(true);
    } catch {
      setMessage("Non è stato possibile inviare l’accesso. Riprova tra poco.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCheckCode) return;

    setCheckingCode(true);
    setMessage(null);

    try {
      const params = new URLSearchParams({
        callbackUrl,
        token: code,
        email: email.trim(),
      });
      const response = await fetch(
        `/api/auth/callback/email?${params.toString()}`,
        {
          credentials: "include",
          redirect: "follow",
        },
      );
      const finalUrl = new URL(response.url, window.location.origin);

      if (
        !response.ok ||
        finalUrl.searchParams.has("error") ||
        finalUrl.pathname === "/login"
      ) {
        setMessage("Codice errato, scaduto o già utilizzato.");
        return;
      }

      window.location.assign(finalUrl.href);
    } catch {
      setMessage("Non è stato possibile verificare il codice. Riprova.");
    } finally {
      setCheckingCode(false);
    }
  }

  function changeEmail() {
    setSent(false);
    setCode("");
    setMessage(null);
  }

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
        <div className="mx-auto max-w-md">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-white/10 bg-black/40">
              <img
                src="/logo.png"
                alt="LedVelvet"
                className="h-10 w-10 object-contain opacity-90"
              />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                LedVelvet
              </div>
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/60">
                Access
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_70px_rgba(0,0,0,0.60)] backdrop-blur-md">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/70">
                Accesso protetto
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Accedi con email
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Riceverai un link personale e un codice di 8 cifre. Puoi usare
                quello più comodo.
              </p>
            </div>

            <div className="px-6 py-6">
              {isDenied && !sent ? (
                <div className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                  <div
                    className="border-b border-white/10 px-5 py-4"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(147,11,12,0.35), rgba(0,0,0,0.25))",
                    }}
                  >
                    <div className="text-[11px] uppercase tracking-[0.26em] text-white/70">
                      Accesso non autorizzato
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      Accedi con un’email amministratore.
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      La sessione attuale non dispone dei permessi necessari per
                      questa pagina.
                    </div>
                  </div>
                </div>
              ) : null}

              {sent ? (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <div className="font-semibold text-emerald-100">
                    Controlla la tua email
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-100/70">
                    Abbiamo inviato il link e un codice a{" "}
                    <span className="text-emerald-50">{email.trim()}</span>.
                    Apri il link oppure inserisci qui il codice di 8 cifre.
                  </p>

                  <form onSubmit={verifyCode} className="mt-4">
                    <label
                      htmlFor="admin-login-code"
                      className="block text-xs uppercase tracking-[0.18em] text-emerald-100/60"
                    >
                      Codice di accesso
                    </label>
                    <input
                      id="admin-login-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 8),
                        )
                      }
                      placeholder="00000000"
                      autoFocus
                      className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-center text-lg tracking-[0.28em] text-white outline-none placeholder:text-white/25 focus:border-white/35"
                    />

                    {message ? (
                      <div className="mt-3 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-sm text-red-100">
                        {message}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={!canCheckCode}
                      className={[
                        "mt-3 h-11 w-full rounded-2xl text-xs font-semibold uppercase tracking-[0.18em] transition",
                        canCheckCode
                          ? "bg-[var(--red-accent)] text-black hover:opacity-90"
                          : "cursor-not-allowed bg-white/10 text-white/35",
                      ].join(" ")}
                    >
                      {checkingCode
                        ? "Verifica in corso…"
                        : "Accedi con il codice"}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={changeEmail}
                    className="mt-4 text-xs uppercase tracking-[0.16em] text-white/60 hover:text-white"
                  >
                    Usa un’altra email
                  </button>
                </div>
              ) : (
                <form onSubmit={sendAccess} className="space-y-4">
                  <label
                    htmlFor="admin-login-email"
                    className="block text-xs uppercase tracking-[0.22em] text-white/70"
                  >
                    Email
                  </label>
                  <input
                    id="admin-login-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nome@dominio.com"
                    autoComplete="email"
                    inputMode="email"
                    autoFocus
                    className="h-11 w-full rounded-2xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none focus:border-white/30 focus:bg-black/45"
                  />

                  {message ? (
                    <div className="rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-sm text-red-100">
                      {message}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={!canSend}
                    className={[
                      "h-11 w-full rounded-2xl text-xs font-semibold uppercase tracking-[0.26em] transition",
                      canSend
                        ? "bg-[var(--red-accent)] text-black hover:opacity-90"
                        : "cursor-not-allowed bg-white/10 text-white/50",
                    ].join(" ")}
                  >
                    {sending ? "Invio in corso…" : "Invia link e codice"}
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/60">
                      Come funziona
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">
                      1) Ricevi l’email · 2) Clicca il link oppure inserisci il
                      codice · 3) Torni nell’area autorizzata.
                    </p>
                  </div>
                </form>
              )}
            </div>

            <div className="border-t border-white/10 bg-black/30 px-6 py-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                © {new Date().getFullYear()} LedVelvet
              </p>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-white/45">
            Se non hai richiesto l’accesso, ignora l’email.
          </div>
        </div>
      </div>
    </main>
  );
}
