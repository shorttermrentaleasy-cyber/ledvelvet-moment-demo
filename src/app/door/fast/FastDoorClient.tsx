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
type AdvanceMode = "automatic" | "manual";

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
  member_email?: string | null;
  member_phone?: string | null;
  member_status?: string | null;
  membership_group?: string | null;
  ticket_first_name?: string | null;
  ticket_last_name?: string | null;
  member_role?: string | null;
  gate_role?: string | null;
};

type LiveEvent = {
  live_key?: string | null;
  result?: string | null;
  created_at?: string | null;
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

type PollDiagnostics = {
  fetched: number;
  checked_in: number;
  checked_in_without_time: number;
  checked_in_without_qr: number;
  candidates: number;
  processed: number;
  skipped_unmapped: number;
  unmapped_scanners: string[];
  latest_xceed_scan?: {
    checked_in_time: number;
    checked_in_by: string | null;
    qr_suffix: string | null;
    already_stored: boolean;
    stored_event: {
      result: string | null;
      gate_id: string | null;
      door_role: string | null;
      created_at: string | null;
    } | null;
  } | null;
  latest_processed?: {
    live_key: string;
    payload_json: FastResponse;
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
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode>("automatic");
  const [doorToken, setDoorToken] = useState("");
  const [pollDiagnostics, setPollDiagnostics] = useState<PollDiagnostics | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLiveKeyRef = useRef("");
  const pollingRef = useRef(false);

  const eventId =
    searchParams.get("event_id") ||
    "6ebab3cf-67dc-47c9-b5f9-92527a0c51f2";
  const gateId = searchParams.get("gate_id")?.trim() || "";

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    setDoorToken(hashParams.get("door_token")?.trim() || "");

    inputRef.current?.focus();

    const savedMode = window.localStorage.getItem("fast-check-advance-mode");
    if (savedMode === "automatic" || savedMode === "manual") {
      setAdvanceMode(savedMode);
    }

    document.documentElement.requestFullscreen?.().catch(() => {});

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const changeAdvanceMode = useCallback((mode: AdvanceMode) => {
    setAdvanceMode(mode);
    window.localStorage.setItem("fast-check-advance-mode", mode);
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
    if (nextDecision === "OK_ACCESS" && advanceMode === "manual") return;

    resetTimerRef.current = setTimeout(() => {
      resetScanner();
    }, 2500);
  }, [advanceMode, resetScanner]);

  useEffect(() => {
    if (decision !== "OK_ACCESS") return;

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    if (advanceMode === "automatic") {
      resetTimerRef.current = setTimeout(() => {
        resetScanner();
      }, 2500);
    }
  }, [advanceMode, decision, resetScanner]);

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
    if (!gateId || !doorToken) return;

    const params = new URLSearchParams({
      eventId,
      gateId,
    });
    const response = await fetch(`/api/door/live-latest?${params.toString()}`, {
      cache: "no-store",
      headers: { "X-Fast-Check-Token": doorToken },
    });

    if (!response.ok) return;

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; item?: LiveEvent | null }
      | null;
    const item = data?.item;
    const liveKey = String(item?.live_key || "");

    if (!liveKey || liveKey === lastLiveKeyRef.current) return;

    lastLiveKeyRef.current = liveKey;

    const createdAt = item?.created_at ? new Date(item.created_at).getTime() : 0;
    const isRecentResult =
      createdAt > 0 && Date.now() - createdAt >= 0 && Date.now() - createdAt <= 15_000;

    if ((applyResult || isRecentResult) && item?.payload_json?.decision) {
      applyDecision(item.payload_json);
      scheduleReset(item.payload_json.decision);
    }
  }, [applyDecision, doorToken, eventId, gateId, scheduleReset]);

  useEffect(() => {
    if (!doorToken) return;

    fetch("/api/door/fast-check-context", {
      cache: "no-store",
      headers: { "X-Fast-Check-Token": doorToken },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Fast Check context denied");
        }

        return response.json();
      })
      .then((data) => {
        setContext({
          event: data?.event || null,
          gate: data?.gate || null,
        });
      })
      .catch(() => {});
  }, [doorToken]);

  useEffect(() => {
    if (!gateId || !doorToken) return;

    let cancelled = false;

    async function poll() {
      if (cancelled || pollingRef.current) return;

      pollingRef.current = true;

      try {
        const response = await fetch("/api/door/xceed-poll", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Fast-Check-Token": doorToken,
          },
          body: JSON.stringify({ event_id: eventId }),
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Fast Check polling denied");
        }

        const pollData = (await response.json().catch(() => null)) as
          | Partial<PollDiagnostics>
          | null;
        setPollDiagnostics({
          fetched: Number(pollData?.fetched || 0),
          checked_in: Number(pollData?.checked_in || 0),
          checked_in_without_time: Number(pollData?.checked_in_without_time || 0),
          checked_in_without_qr: Number(pollData?.checked_in_without_qr || 0),
          candidates: Number(pollData?.candidates || 0),
          processed: Number(pollData?.processed || 0),
          skipped_unmapped: Number(pollData?.skipped_unmapped || 0),
          unmapped_scanners: Array.isArray(pollData?.unmapped_scanners)
            ? pollData.unmapped_scanners.map(String)
            : [],
          latest_xceed_scan: pollData?.latest_xceed_scan || null,
          latest_processed: pollData?.latest_processed || null,
        });

        setConnectionState("online");

        if (pollData?.latest_processed?.payload_json?.decision) {
          lastLiveKeyRef.current = pollData.latest_processed.live_key;
          applyDecision(pollData.latest_processed.payload_json);
          scheduleReset(pollData.latest_processed.payload_json.decision);
        }

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
    const interval = window.setInterval(() => void poll(), 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [doorToken, eventId, gateId, loadLatestGateResult]);

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
          "X-Fast-Check-Token": doorToken,
        },
        body: JSON.stringify({
          event_id: eventId,
          code,
          gate_id: gateId,
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
  const memberEmail = resultDetails?.member_email || "";
  const memberPhone = resultDetails?.member_phone || "";
  const showRenewalContact =
    decision === "MEMBERSHIP_INACTIVE" || decision === "MEMBERSHIP_EXPIRED";
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
  const resultStaysOpen = Boolean(
    decision && (keepsResultOpen(decision) || advanceMode === "manual")
  );
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
      className="min-h-[100dvh] w-full bg-black text-white"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col justify-start gap-2 px-3 py-2 sm:px-5">
        <header className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <div className="w-full px-3 py-2 text-center sm:px-4">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              Fast Check
            </div>
            <h1 className="text-lg font-black sm:text-xl">
              {context?.event?.name || "Evento in caricamento"}
            </h1>
            <div className="mt-0.5 text-xs text-white/55 sm:text-sm">
              {[eventDate, eventPlace].filter(Boolean).join(" · ") || eventId}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-1.5 border-t border-white/10 px-3 py-2 sm:px-4">
            <div
              className="flex rounded-full border border-white/15 bg-white/5 p-0.5"
              onClick={(event) => event.stopPropagation()}
              aria-label="Modalità avanzamento Fast Check"
            >
              <button
                type="button"
                onClick={() => changeAdvanceMode("automatic")}
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase transition ${
                  advanceMode === "automatic"
                    ? "bg-cyan-300 text-black"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Automatico
              </button>
              <button
                type="button"
                onClick={() => changeAdvanceMode("manual")}
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase transition ${
                  advanceMode === "manual"
                    ? "bg-cyan-300 text-black"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Manuale
              </button>
            </div>
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
          {pollDiagnostics && (
            <div className="flex flex-wrap items-center justify-center gap-x-2 border-t border-white/10 px-3 py-1.5 text-center text-[10px] leading-4 text-white/50 sm:text-xs">
              <span>
                Xceed: {pollDiagnostics.fetched} letti · {pollDiagnostics.checked_in} validi
                {pollDiagnostics.checked_in_without_time > 0 &&
                  ` · ${pollDiagnostics.checked_in_without_time} senza orario`}
                {pollDiagnostics.checked_in_without_qr > 0 &&
                  ` · ${pollDiagnostics.checked_in_without_qr} senza QR`}
                {pollDiagnostics.candidates > 0 && ` · ${pollDiagnostics.candidates} nuovi`}
                {pollDiagnostics.processed > 0 && ` · ${pollDiagnostics.processed} elaborati`}
                {pollDiagnostics.skipped_unmapped > 0 &&
                  ` · ${pollDiagnostics.skipped_unmapped} scanner non associati: ${pollDiagnostics.unmapped_scanners.join(", ")}`}
              </span>
              {pollDiagnostics.latest_xceed_scan && (
                <span>
                  · Ultimo scan: {pollDiagnostics.latest_xceed_scan.checked_in_by || "email assente"}
                  {pollDiagnostics.latest_xceed_scan.checked_in_time > 0 &&
                    ` · ${new Date(pollDiagnostics.latest_xceed_scan.checked_in_time * 1000).toLocaleTimeString("it-IT")}`}
                  {pollDiagnostics.latest_xceed_scan.already_stored
                    ? ` · ${pollDiagnostics.latest_xceed_scan.stored_event?.result || "salvato"}`
                    : " · non salvato"}
                </span>
              )}
            </div>
          )}
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-1 text-center">
        <div
          className={`h-28 w-28 rounded-full transition-all duration-150 sm:h-32 sm:w-32 ${
            status === "ok"
              ? "bg-green-500 shadow-[0_0_80px_rgba(34,197,94,0.9)]"
              : status === "warning"
                ? "bg-yellow-400 shadow-[0_0_80px_rgba(250,204,21,0.9)]"
                : status === "no"
                  ? "bg-red-500 shadow-[0_0_80px_rgba(239,68,68,0.9)]"
                  : "bg-white/10"
          }`}
        />

        <div className="text-2xl font-black tracking-wide sm:text-3xl">
          {mainLabel()}
        </div>

        {message && (
          <div
            className={`max-w-2xl rounded-2xl border px-4 py-2 text-sm font-bold sm:text-base ${
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
          <div className="flex max-w-xl flex-wrap items-center justify-center gap-1.5 text-sm">
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

        {(memberEmail || memberPhone) && (
          <div className="flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-xs text-white/70">
            {memberEmail && <span>Email: {memberEmail}</span>}
            {memberPhone && <span>Cellulare: {memberPhone}</span>}
          </div>
        )}

        {decision && (
          <>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
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
                    className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-black hover:bg-cyan-200"
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
                  className="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-black uppercase tracking-wide hover:bg-white/15"
                >
                  {decision === "OK_ACCESS" ? "Continua" : "Operazione conclusa"}
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

        <footer className="grid gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-[10px] sm:grid-cols-3 sm:text-[11px]">
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
            {showRenewalContact && (memberEmail || memberPhone) && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                {memberEmail && <div>{memberEmail}</div>}
                {memberPhone && <div>{memberPhone}</div>}
              </div>
            )}
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
