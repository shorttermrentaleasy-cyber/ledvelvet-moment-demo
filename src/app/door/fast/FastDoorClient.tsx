"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type FastStatus = "idle" | "ok" | "warning" | "no";

type FastDecision =
  | "OK_ACCESS"
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
};

type LiveEvent = {
  live_key?: string | null;
  payload_json?: FastResponse | null;
};

export default function FastDoorClient() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<FastStatus>("idle");
  const [message, setMessage] = useState("");
  const [decision, setDecision] = useState<FastDecision | null>(null);
  const [loading, setLoading] = useState(false);

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
    setLoading(false);

    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, []);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = setTimeout(() => {
      resetScanner();
    }, 1600);
  }, [resetScanner]);

  const applyDecision = useCallback((data: FastResponse) => {
    const nextDecision = data.decision || "FATAL_ERROR";

    setDecision(nextDecision);
    setMessage(data.message || "Esito non disponibile.");

    if (nextDecision === "OK_ACCESS") {
      setStatus("ok");
      playOkFeedback();
      return;
    }

    if (
      nextDecision === "MEMBER_NOT_FOUND" ||
      nextDecision === "MEMBERSHIP_INACTIVE" ||
      nextDecision === "MEMBERSHIP_EXPIRED" ||
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
      scheduleReset();
    }
  }, [applyDecision, eventId, gateId, scheduleReset]);

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

        if (!cancelled) {
          await loadLatestGateResult(true);
        }
      } catch {
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

    try {
      const response = await fetch("/api/door/fast-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: eventId,
          code,
        }),
      });

      const data = (await response.json()) as FastResponse;

      applyDecision(data);
    } catch {
      setStatus("no");
      setDecision("FATAL_ERROR");
      setMessage("Errore di collegamento.");
      playAttentionFeedback();
    }

    scheduleReset();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      handleScan(event.currentTarget.value);
    }
  }

  function mainLabel() {
    if (status === "ok") return "OK";
    if (status === "warning") return "ATTENZIONE";
    if (status === "no") return "NO";
    return loading ? "CONTROLLO" : "SCAN";
  }

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-black text-white"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-7 px-4 text-center">
        <div
          className={`h-64 w-64 rounded-full transition-all duration-150 ${
            status === "ok"
              ? "bg-green-500 shadow-[0_0_80px_rgba(34,197,94,0.9)]"
              : status === "warning"
                ? "bg-yellow-400 shadow-[0_0_80px_rgba(250,204,21,0.9)]"
                : status === "no"
                  ? "bg-red-500 shadow-[0_0_80px_rgba(239,68,68,0.9)]"
                  : "bg-white/10"
          }`}
        />

        <div className="text-4xl font-black tracking-wider md:text-5xl">
          {mainLabel()}
        </div>

        {message && (
          <div
            className={`max-w-xl rounded-2xl border px-5 py-4 text-xl font-bold ${
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

        {decision && (
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            {decision}
          </div>
        )}

        <input
          ref={inputRef}
          onKeyDown={onKeyDown}
          autoFocus
          inputMode="none"
          aria-label="Lettura QR Fast Check"
          className="absolute left-0 top-0 h-px w-px opacity-0"
        />

        <div className="text-xs text-white/30">
          Evento: {eventId}
        </div>
      </div>
    </div>
  );
}
