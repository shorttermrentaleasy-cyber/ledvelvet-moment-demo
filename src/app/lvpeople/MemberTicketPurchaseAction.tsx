"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PurchaseState = "ready" | "checking" | "manual-check";

const CHECK_INTERVAL_MS = 5_000;
const CHECK_TIMEOUT_MS = 60_000;

export default function MemberTicketPurchaseAction({
  checkoutUrl,
}: {
  checkoutUrl: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<PurchaseState>("ready");
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    if (state !== "checking") return;

    const refreshTicketStatus = () => {
      const now = Date.now();
      if (now - lastRefreshAt.current < 2_000) return;
      lastRefreshAt.current = now;
      router.refresh();
    };

    const handleFocus = () => refreshTicketStatus();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshTicketStatus();
    };

    const interval = window.setInterval(refreshTicketStatus, CHECK_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setState("manual-check");
    }, CHECK_TIMEOUT_MS);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, state]);

  if (state === "ready") {
    return (
      <a
        href={checkoutUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setState("checking")}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#8d003f] to-[#e00072] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition hover:brightness-110"
      >
        Acquista il tuo biglietto
      </a>
    );
  }

  if (state === "manual-check") {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            lastRefreshAt.current = 0;
            router.refresh();
            setState("checking");
          }}
          className="inline-flex items-center justify-center rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-300/15"
        >
          Verifica acquisto
        </button>
        <p className="mt-2 text-xs text-white/60">
          Se hai completato il pagamento, verifica di nuovo. Il pulsante per un secondo acquisto resta bloccato.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-fuchsia-300/25 bg-fuchsia-300/10 px-4 py-3 text-sm text-fuchsia-100">
      <div className="font-semibold">Verifica dell’acquisto in corso…</div>
      <div className="mt-1 text-fuchsia-100/75">
        Dopo il pagamento torna a questa scheda: il biglietto verrà riconosciuto automaticamente.
      </div>
    </div>
  );
}
