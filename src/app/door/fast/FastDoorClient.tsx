"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";

const WALLY_NEW_MEMBERSHIP_URL =
  process.env.NEXT_PUBLIC_WALLY_MEMBERSHIP_URL ||
  "https://www.wallyfor.com/step1.php?ref=1d7439beb34f751e1db481e40592079e";
const WALLY_RENEWAL_URL =
  process.env.NEXT_PUBLIC_WALLY_RENEWAL_URL ||
  "https://wallyfor.com/rinnovi/index.php?idcode=5355";

type FastStatus = "idle" | "ok" | "warning" | "no";

type FastDecision =
  | "OK_ACCESS"
  | "WRONG_GATE"
  | "NO_TICKET"
  | "MEMBER_NOT_FOUND"
  | "MEMBERSHIP_INACTIVE"
  | "MEMBERSHIP_EXPIRED"
  | "MEMBERSHIP_REVIEW"
  | "MISSING_INPUT"
  | "DB_ERROR"
  | "FATAL_ERROR";

type FastResponse = {
  ok: boolean;
  decision?: FastDecision;
  message?: string;
  member?: {
    first_name?: string | null;
    last_name?: string | null;
    membership_group?: string | null;
    status?: string | null;
  } | null;
  member_first_name?: string | null;
  member_last_name?: string | null;
  member_status?: string | null;
  membership_group?: string | null;
  ticket_first_name?: string | null;
  ticket_last_name?: string | null;
  member_role?: string | null;
  gate_role?: string | null;
};

type LiveEvent = {
  live_key?: string | null;
  payload_json?: FastResponse | null;
};

type FastContext = {
  event?: {
    name?: string | null;
    starts_at?: string | null;
    venue?: string | null;
    city?: string | null;
  } | null;
  gate?: {
    gate_id?: string | null;
    name?: string | null;
    door_role?: string | null;
    xceed_email?: string | null;
    active?: boolean | null;
  } | null;
};

function keepsResultOpen(decision?: FastDecision | null) {
  return decision !== "OK_ACCESS";
}

export default function FastDoorClient() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<FastStatus>("idle");
  const [message, setMessage] = useState("");
  const [decision, setDecision] = useState<FastDecision | null>(null);
  const [resultDetails, setResultDetails] = useState<FastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<FastContext | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "online" | "retrying">("connecting");
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [wallyQrOpen, setWallyQrOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLiveKeyRef = useRef("");
  const pollingRef = useRef(false);

  const eventId =
    searchParams.get("event_id") ||
    "6ebab3cf-67dc-47c9-b5f9-92527a0c51f2";
  const gateId = searchParams.get("gate_id")?.trim() || "";

  useEffect(() => {
    inputRef.current?.focus();

    document.documentElement.requestFullscreen?.().catch(() => {});

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const playOkFeedback = useCallback(() => {
    new Audio("/ok.mp3").play().catch(() => {});
    navigator.vibrate?.(100);
  }, []);

  const playAttentionFeedback = useCallback(() => {
    new Audio("/no.mp3").play().catch(() => {});
    navigator.vibrate?.([100, 50, 100]);
  }, []);

  const resetScanner = useCallback(() => {
    setStatus("idle");
    setMessage("");
    setDecision(null);
    setResultDetails(null);
    setLoading(false);
    setWallyQrOpen(false);

    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, []);

  const scheduleReset = useCallback((nextDecision?: FastDecision | null) => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    if (keepsResultOpen(nextDecision)) return;

    resetTimerRef.current = setTimeout(() => {
      resetScanner();
    }, 2500);
  }, [resetScanner]);

  const applyDecision = useCallback((data: FastResponse) => {
    const nextDecision = data.decision || "FATAL_ERROR";

    setDecision(nextDecision);
    setMessage(data.message || "Esito non disponibile.");
    setResultDetails(data);
    setLastScanAt(new Date());
    setWallyQrOpen(false);

    if (nextDecision === "OK_ACCESS") {
      setStatus("ok");
      playOkFeedback();
      return;
    }

    if (
      nextDecision === "WRONG_GATE" ||
      nextDecision === "MEMBERSHIP_REVIEW"
    ) {
      setStatus("warning");
      playAttentionFeedback();
      return;
    }

    setStatus("no");
    playAttentionFeedback();
  }, [playAttentionFeedback, playOkFeedback]);

  const loadLatestGateResult = useCallback(async (applyResult: boolean) => {
    if (!gateId) return;

    const params = new URLSearchParams({
      eventId,
      gateId,
    });
    const response = await fetch(`/api/door/live-latest?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; item?: LiveEvent | null }
      | null;
    const item = data?.item;
    const liveKey = String(item?.live_key || "");

    if (!liveKey || liveKey === lastLiveKeyRef.current) return;

    lastLiveKeyRef.current = liveKey;

    if (applyResult && item?.payload_json?.decision) {
      applyDecision(item.payload_json);
      scheduleReset(item.payload_json.decision);
    }
  }, [applyDecision, eventId, gateId, scheduleReset]);

  useEffect(() => {
    if (!eventId || !gateId) return;

    Promise.all([
      fetch("/api/admin/analytics-events", { cache: "no-store" }).then((response) =>
        response.json()
      ),
      fetch("/api/admin/door-gates", { cache: "no-store" }).then((response) =>
        response.json()
      ),
    ])
      .then(([eventsData, gatesData]) => {
        setContext({
          event: eventsData?.events?.find((event: any) => event.id === eventId) || null,
          gate: gatesData?.gates?.find((gate: any) => gate.gate_id === gateId) || null,
        });
      })
      .catch(() => {});
  }, [eventId, gateId]);

  useEffect(() => {
    if (!gateId) return;

    let cancelled = false;

    async function poll() {
      if (cancelled || pollingRef.current) return;

      pollingRef.current = true;

      try {
        await fetch("/api/door/xceed-poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: eventId }),
          cache: "no-store",
        });

        setConnectionState("online");

        if (!cancelled) {
          await loadLatestGateResult(true);
        }
      } catch {
        setConnectionState("retrying");
        // Il polling riprova al ciclo successivo senza bloccare Fast Check.
      } finally {
        pollingRef.current = false;
      }
    }

    async function start() {
      try {
        await loadLatestGateResult(false);
      } catch {
        // Il primo ciclo di polling riproverà la lettura.
      }

      if (!cancelled) {
        void poll();
      }
    }

    void start();
    const interval = window.setInterval(() => void poll(), 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [eventId, gateId, loadLatestGateResult]);

  async function handleScan(value: string) {
    const code = value.trim();

    if (!code || loading) {
      return;
    }

    setLoading(true);
    setMessage("");
    setDecision(null);
    setResultDetails(null);

    try {
      const response = await fetch("/api/door/fast-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: eventId,
          code,
          gate_role: context?.gate?.door_role || null,
        }),
      });

      const data = (await response.json()) as FastResponse;

      applyDecision(data);
      scheduleReset(data.decision);
    } catch {
      setStatus("no");
      setDecision("FATAL_ERROR");
      setMessage("Errore di collegamento.");
      playAttentionFeedback();
      scheduleReset("FATAL_ERROR");
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      handleScan(event.currentTarget.value);
    }
  }

  function mainLabel() {
    if (decision === "WRONG_GATE") return "GATE NON CORRETTO";
    if (decision === "MEMBERSHIP_REVIEW") return "VERIFICA TESSERA";
    if (decision === "MEMBER_NOT_FOUND") return "TESSERA NON PRESENTE";
    if (decision === "MEMBERSHIP_EXPIRED") return "TESSERA SCADUTA";
    if (decision === "MEMBERSHIP_INACTIVE") return "TESSERA NON ATTIVA";
    if (status === "ok") return "ACCESSO OK";
    if (status === "no") return "ERRORE";
    return loading ? "CONTROLLO" : "IN ATTESA";
  }

  const displayFirstName =
    resultDetails?.member?.first_name ||
    resultDetails?.member_first_name ||
    resultDetails?.ticket_first_name ||
    "";
  const displayLastName =
    resultDetails?.member?.last_name ||
    resultDetails?.member_last_name ||
    resultDetails?.ticket_last_name ||
    "";
  const displayName = `${displayFirstName} ${displayLastName}`.trim();
  const membershipGroup =
    resultDetails?.member?.membership_group ||
    resultDetails?.membership_group ||
    (decision === "MEMBER_NOT_FOUND" ? "NON SOCIO" : "");
  const membershipStatus =
    resultDetails?.member?.status || resultDetails?.member_status || "";
  const eventDate = context?.event?.starts_at
    ? new Date(context.event.starts_at).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
  const eventPlace = [context?.event?.venue, context?.event?.city]
    .filter(Boolean)
    .join(" · ");
  const gateRole = String(context?.gate?.door_role || resultDetails?.gate_role || "")
    .toUpperCase();
  const resultStaysOpen = Boolean(decision && keepsResultOpen(decision));
  const wallyAction =
    decision === "MEMBER_NOT_FOUND"
      ? {
          label: "Mostra QR nuova tessera",
          title: "Fai la nuova tessera",
          url: WALLY_NEW_MEMBERSHIP_URL,
        }
      : decision === "MEMBERSHIP_INACTIVE" || decision === "MEMBERSHIP_EXPIRED"
        ? {
            label: "Mostra QR rinnovo",
            title: "Rinnova la tessera",
            url: WALLY_RENEWAL_URL,
          }
        : null;

  return (
    <div
      className="min-h-screen w-full bg-black text-white"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-3 px-3 py-3 sm:px-5">
        <header className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              Fast Check
            </div>
            <h1 className="mt-0.5 text-lg font-black sm:text-xl">
              {context?.event?.name || "Evento in caricamento"}
            </h1>
            <div className="mt-0.5 text-xs text-white/55 sm:text-sm">
              {[eventDate, eventPlace].filter(Boolean).join(" · ") || eventId}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase">
              {context?.gate?.name || gateId}
            </span>
            {gateRole && (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-200">
                {gateRole}
              </span>
            )}
            {context?.gate?.xceed_email && (
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/55">
                {context.gate.xceed_email}
              </span>
            )}
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                connectionState === "online"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-300/30 bg-amber-300/10 text-amber-200"
              }`}
            >
              {connectionState === "online"
                ? "XCEED CONNESSO"
                : connectionState === "retrying"
                  ? "RICONNESSIONE…"
                  : "CONNESSIONE…"}
            </span>
          </div>
        </header>

        <main className="flex flex-col items-center justify-center gap-3 py-1 text-center">
        <div
          className={`h-36 w-36 rounded-full transition-all duration-150 sm:h-44 sm:w-44 ${
            status === "ok"
              ? "bg-green-500 shadow-[0_0_80px_rgba(34,197,94,0.9)]"
              : status === "warning"
                ? "bg-yellow-400 shadow-[0_0_80px_rgba(250,204,21,0.9)]"
                : status === "no"
                  ? "bg-red-500 shadow-[0_0_80px_rgba(239,68,68,0.9)]"
                  : "bg-white/10"
          }`}
        />

        <div className="text-2xl font-black tracking-wide sm:text-4xl">
          {mainLabel()}
        </div>

        {message && (
          <div
            className={`max-w-2xl rounded-2xl border px-4 py-2.5 text-base font-bold sm:text-lg ${
              status === "ok"
                ? "border-green-400/30 bg-green-500/10 text-green-200"
                : status === "warning"
                  ? "border-yellow-300/30 bg-yellow-400/10 text-yellow-100"
                  : "border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {message}
          </div>
        )}

        {(displayName || membershipGroup || membershipStatus) && (
          <div className="flex max-w-xl flex-wrap items-center justify-center gap-2 text-base">
            {displayName && (
              <span className="font-bold text-white">{displayName}</span>
            )}
            {membershipGroup && (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/90">
                {membershipGroup}
              </span>
            )}
            {membershipStatus && (
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wider text-white/60">
                {membershipStatus}
              </span>
            )}
          </div>
        )}

        {decision && (
          <>
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              {decision}
              {lastScanAt && ` · ${lastScanAt.toLocaleTimeString("it-IT")}`}
            </div>
            {resultStaysOpen && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {wallyAction && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setWallyQrOpen(true);
                    }}
                    className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black uppercase tracking-wide text-black hover:bg-cyan-200"
                  >
                    {wallyAction.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    resetScanner();
                  }}
                  className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-wide hover:bg-white/15"
                >
                  Operazione conclusa
                </button>
              </div>
            )}
          </>
        )}

        <input
          ref={inputRef}
          onKeyDown={onKeyDown}
          autoFocus
          inputMode="none"
          aria-label="Lettura QR Fast Check"
          className="absolute left-0 top-0 h-px w-px opacity-0"
        />

        </main>

        <footer className="grid gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] sm:grid-cols-3 sm:text-xs">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full bg-green-500" />
            <span><b>Verde</b> · Tessera attiva, gate corretto</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full bg-yellow-400" />
            <span><b>Giallo</b> · Tessera attiva, gate non corretto</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
            <span><b>Rosso</b> · Tessera assente, scaduta o inattiva</span>
          </div>
        </footer>
      </div>

      {wallyQrOpen && wallyAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={(event) => {
            event.stopPropagation();
            setWallyQrOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/15 bg-zinc-950 p-5 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-2xl font-black">{wallyAction.title}</div>
            <div className="mt-1 text-sm text-white/55">
              Inquadra il QR con il telefono
            </div>
            <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-4">
              <QRCode value={wallyAction.url} size={240} />
            </div>
            <button
              type="button"
              onClick={() => setWallyQrOpen(false)}
              className="mt-4 w-full rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black uppercase"
            >
              Chiudi QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
