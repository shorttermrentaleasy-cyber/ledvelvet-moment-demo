"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccountSummary = {
  ok?: boolean;
  authenticated?: boolean;
  profile?: {
    isMember?: boolean;
    isAdmin?: boolean;
    qualification?: string;
  };
};

const DISMISS_KEY = "lv-non-member-cta-dismissed";

export default function NonMemberCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;

    let cancelled = false;
    fetch("/api/account/summary", { cache: "no-store", credentials: "include" })
      .then((response) => response.json())
      .then((json: AccountSummary) => {
        if (cancelled) return;
        if (json?.ok && json.authenticated && json.profile && !json.profile.isMember) {
          setVisible(true);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <aside className="fixed inset-x-3 top-20 z-[120] mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/90 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:left-auto sm:right-5 sm:top-24 sm:mx-0 sm:w-[360px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/50">LV People</div>
          <div className="mt-1 text-sm font-semibold">Non risulti ancora socio LEDVELVET.</div>
          <p className="mt-2 text-xs leading-5 text-white/65">
            Puoi richiedere la tessera per accedere ai servizi riservati ai soci e agli acquisti dedicati.
          </p>
        </div>
        <button
          type="button"
          aria-label="Chiudi avviso"
          onClick={() => {
            window.sessionStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-sm text-white/70"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href="/become-member?from=/moment2"
          className="inline-flex flex-1 items-center justify-center rounded-full bg-[var(--red-accent)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white"
        >
          Unisciti a LV People
        </Link>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
          className="rounded-full border border-white/15 px-4 py-2.5 text-xs text-white/70"
        >
          Non ora
        </button>
      </div>
    </aside>
  );
}
