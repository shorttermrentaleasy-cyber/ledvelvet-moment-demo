"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from "@zxing/browser";

type DoorResult =
  | "ERROR"
  | "DENY_WALLY"
  | "DENY_RENEWAL"
  | "ALREADY_CHECKED_IN"
  | "OK_MEMBER"
  | "OK_PRIORITY"
  | "OK_PRIVILEGED";

type DoorApiResponse = {
  ok: boolean;
  result: DoorResult;
  title: string;
  message: string;
  badge?: string;
  action?: "OPEN_WALLY";
  action_url?: string;
  person?: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  member?: {
    id: string;
    membership_group: string | null;
    status: string | null;
    membership_expires_at: string | null;
    door_role: "ordinary" | "loyalty" | "privileged";
  } | null;
  ticket?: {
    id?: string | null;
    qr_code?: string | null;
    event_id?: string | null;
    status?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    buyer_email?: string | null;
    checked_in?: boolean;
    booking_id?: string | null;
    transaction_id?: string | null;
    offer_name?: string | null;
    offer_type?: string | null;
    source?: "xceed_tickets";
  } | null;
  booking?: {
    booking_id: string | null;
    ticket_count: number;
    checked_in_count: number;
    progress_label: string;
  } | null;
  event?: {
    id: string;
    xceed_event_uuid: string | null;
    xceed_event_ref: string | null;
    require_ticket: boolean;
    require_membership: boolean;
    require_active_membership: boolean;
  } | null;
  debug?: {
    matched_by?: "email" | "phone" | "name" | null;
    source?: "xceed_tickets" | "xceed_raw";
  };
  error?: string;
  live_key?: string | null;
};

type UiTheme = {
  shell: string;
  card: string;
  border: string;
  glow: string;
  badge: string;
  title: string;
  accent: string;
};

function getTheme(result?: DoorResult): UiTheme {
  switch (result) {
    case "OK_MEMBER":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.25),_rgba(2,6,23,1)_45%)]",
        card: "bg-emerald-500/15",
        border: "border-emerald-400/40",
        glow: "shadow-[0_0_50px_rgba(34,197,94,0.25)]",
        badge: "bg-emerald-400 text-black",
        title: "text-emerald-300",
        accent: "text-emerald-200",
      };
    case "OK_PRIORITY":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.28),_rgba(88,28,135,0.35),_rgba(2,6,23,1)_55%)]",
        card: "bg-yellow-400/12",
        border: "border-yellow-300/40",
        glow: "shadow-[0_0_60px_rgba(250,204,21,0.25)]",
        badge: "bg-yellow-300 text-black",
        title: "text-yellow-200",
        accent: "text-fuchsia-100",
      };
    case "OK_PRIVILEGED":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_rgba(2,6,23,1)_50%)]",
        card: "bg-blue-500/15",
        border: "border-blue-400/40",
        glow: "shadow-[0_0_50px_rgba(59,130,246,0.25)]",
        badge: "bg-blue-300 text-slate-950",
        title: "text-blue-200",
        accent: "text-blue-100",
      };
    case "ALREADY_CHECKED_IN":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.28),_rgba(2,6,23,1)_50%)]",
        card: "bg-amber-500/15",
        border: "border-amber-400/40",
        glow: "shadow-[0_0_50px_rgba(245,158,11,0.25)]",
        badge: "bg-amber-300 text-black",
        title: "text-amber-200",
        accent: "text-amber-100",
      };
    case "DENY_RENEWAL":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.28),_rgba(2,6,23,1)_50%)]",
        card: "bg-orange-500/15",
        border: "border-orange-400/40",
        glow: "shadow-[0_0_50px_rgba(249,115,22,0.25)]",
        badge: "bg-orange-300 text-black",
        title: "text-orange-200",
        accent: "text-orange-100",
      };
    case "DENY_WALLY":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.28),_rgba(2,6,23,1)_50%)]",
        card: "bg-red-500/15",
        border: "border-red-400/40",
        glow: "shadow-[0_0_50px_rgba(239,68,68,0.25)]",
        badge: "bg-red-300 text-black",
        title: "text-red-200",
        accent: "text-red-100",
      };
    case "ERROR":
    default:
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.22),_rgba(2,6,23,1)_45%)]",
        card: "bg-white/8",
        border: "border-white/15",
        glow: "shadow-[0_0_40px_rgba(255,255,255,0.08)]",
        badge: "bg-slate-300 text-black",
        title: "text-white",
        accent: "text-slate-200",
      };
  }
}

function row(label: string, value?: React.ReactNode) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-white/10 py-2 last:border-b-0">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-sm text-white break-all">{value || "—"}</div>
    </div>
  );
}

export default function DoorPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [lastLiveTicketKey, setLastLiveTicketKey] = useState("");
  const [manualQr, setManualQr] = useState("");
  const [lastQr, setLastQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [response, setResponse] = useState<DoorApiResponse | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  const theme = useMemo(() => getTheme(response?.result), [response?.result]);

  const loadDoorEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      setUiError(null);

      const res = await fetch("/api/public/door-events", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Load eventi fallita (${res.status})`);
      }

      const json = await res.json();
      const items = Array.isArray(json) ? json : json?.events || json?.data || [];

      setEvents(items);

      setSelectedEventId((prev) => {
        if (prev) return prev;
        return items.length > 0 ? items[0].id : "";
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Errore caricamento eventi";
      setUiError(msg);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const evaluateQr = useCallback(
    async (qr: string, opts?: { silent?: boolean }) => {
      const value = qr.trim();
      if (!value) return;

      if (!opts?.silent) {
        setLoading(true);
      }
      setUiError(null);

      try {
        const res = await fetch("/api/door/xceed-live-evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ qrCode: value }),
        });

        const json = (await res.json()) as DoorApiResponse;
        setResponse(json);
        setLastQr(value);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Errore di rete";
        setUiError(msg);
        setResponse({
          ok: false,
          result: "ERROR",
          title: "ERRORE",
          message: "Errore chiamata API",
          error: msg,
        });
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    []
  );

  const loadLatestCheckedInResult = useCallback(
    async (eventId: string) => {
      try {
        const res = await fetch("/api/door/xceed-live-evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventId,
            latestCheckedIn: true,
          }),
        });

        const json = (await res.json()) as DoorApiResponse & {
          live_key?: string | null;
        };

        if (!res.ok || !json?.ok) return;

        const nextKey =
          json.live_key ||
          json.ticket?.id ||
          json.ticket?.transaction_id ||
          json.ticket?.qr_code ||
          "";

        if (!nextKey) return;
        if (nextKey === lastLiveTicketKey) return;

        setResponse(json);
        setLastLiveTicketKey(nextKey);

        if (json.ticket?.qr_code) {
          setLastQr(json.ticket.qr_code);
          setManualQr(json.ticket.qr_code);
        }
      } catch (error) {
        console.error("Errore loadLatestCheckedInResult", error);
      }
    },
    [lastLiveTicketKey]
  );

  const refreshDoorData = useCallback(async () => {
    try {
      if (syncing) return;

      setSyncing(true);
      setUiError(null);

      const localEventId = selectedEventId || response?.event?.id || null;

      if (!localEventId) {
        throw new Error("Seleziona un evento prima di eseguire il sync");
      }

      const syncUrl = new URL("/api/xceed/sync-tickets", window.location.origin);
      syncUrl.searchParams.set("localEventId", localEventId);

      const syncRes = await fetch(syncUrl.toString(), {
        method: "GET",
        cache: "no-store",
      });

      const syncJson = await syncRes.json().catch(() => null);

      if (!syncRes.ok || !syncJson?.ok) {
        throw new Error(
          `Sync tickets fallita (${syncRes.status}) ${
            syncJson?.error || syncJson?.details || ""
          }`.trim()
        );
      }

      if (syncJson?.ok) {
        setLastSyncAt(Date.now());
      }

      await loadLatestCheckedInResult(localEventId);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Errore refresh dati";
      setUiError(msg);
    } finally {
      setSyncing(false);
    }
  }, [
    syncing,
    selectedEventId,
    response?.event?.id,
    loadLatestCheckedInResult,
  ]);

  async function startScanner() {
    if (!videoRef.current) return;

    try {
      controlsRef.current?.stop();
      setUiError(null);

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error, controls) => {
          controlsRef.current = controls;

          if (result) {
            const qr = result.getText()?.trim();
            if (!qr) return;

            controlsRef.current?.stop();
            setScanActive(false);
            setManualQr(qr);
            void evaluateQr(qr);
          }

          if (error) {
            // ignore continuous scanner errors
          }
        }
      );

      controlsRef.current = controls;
      setScanActive(true);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Errore avvio camera";

      setUiError(
        `Scanner test non disponibile su questo device/browser. Nessun problema: il flusso reale resta Xceed app, qui puoi usare input manuale QR. Dettaglio: ${msg}`
      );
      setScanActive(false);
    }
  }
  function stopScanner() {
    controlsRef.current?.stop();
    setScanActive(false);
  }

  function resetAll() {
    setManualQr("");
    setLastQr("");
    setLastLiveTicketKey("");
    setResponse(null);
    setUiError(null);
    stopScanner();
  }

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      readerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadDoorEvents();
  }, [loadDoorEvents]);

  useEffect(() => {
    if (!selectedEventId) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      void refreshDoorData();
    }, 12000);

    return () => {
      clearInterval(interval);
    };
  }, [selectedEventId, refreshDoorData]);

  const bigTitle = response?.title || "DOOR CHECK";
  const bigMessage =
    response?.message || "Monitor porta: Xceed scansiona, qui controlli l’esito";

  return (
    <div className={`min-h-screen text-white ${theme.shell}`}>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
              LedVelvet Door
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              Monitor Porta
            </h1>
            <div className="mt-2 text-sm text-slate-300 md:text-base">
              Xceed app scansiona → sync ticket → verifica socio → esito ingresso
            </div>
          </div>

          <div className="min-w-[280px]">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white backdrop-blur outline-none"
            >
              <option value="" className="text-black">
                {loadingEvents ? "Caricamento eventi..." : "Seleziona evento"}
              </option>
              {events.map((event) => (
                <option key={event.id} value={event.id} className="text-black">
                  {event.name}
                  {event.city ? ` - ${event.city}` : ""}
                  {event.venue ? ` - ${event.venue}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void startScanner()}
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium backdrop-blur transition hover:bg-white/15"
            >
              {scanActive ? "Scanner test attivo" : "Avvia scanner test"}
            </button>

            <button
              onClick={stopScanner}
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
            >
              Stop
            </button>

            <button
              onClick={() => void refreshDoorData()}
              disabled={syncing || loading}
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? "Aggiornamento..." : "Aggiorna dati"}
            </button>

            <button
              onClick={resetAll}
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <div
              className={`rounded-3xl border ${theme.border} bg-black/25 p-4 backdrop-blur-xl`}
            >
              <div className="mb-3 text-sm font-medium text-slate-300">
                Camera scanner (solo test)
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[3/4] w-full object-cover"
                  muted
                  playsInline
                />
              </div>

              <div className="mt-3 text-xs text-slate-400">
                Nel flusso reale la scansione ufficiale resta su Xceed app. Questo scanner è solo un test locale opzionale: se la camera del device/browser non parte, usa input manuale QR.
              </div>
            </div>

            <div
              className={`rounded-3xl border ${theme.border} bg-black/25 p-4 backdrop-blur-xl`}
            >
              <div className="mb-3 text-sm font-medium text-slate-300">
                Input manuale QR
              </div>

              <textarea
                value={manualQr}
                onChange={(e) => setManualQr(e.target.value)}
                placeholder="Incolla qui il QR code"
                className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />

              <button
                onClick={() => void evaluateQr(manualQr)}
                disabled={!manualQr.trim() || loading}
                className="mt-3 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Verifica in corso..." : "Verifica QR"}
              </button>

              {lastQr ? (
                <div className="mt-3 text-xs text-slate-400 break-all">
                  Ultimo QR: {lastQr}
                </div>
              ) : null}

              {lastSyncAt ? (
                <div className="mt-2 text-xs text-slate-500">
                  Ultimo sync: {new Date(lastSyncAt).toLocaleTimeString()}
                </div>
              ) : null}
            </div>

            {uiError ? (
              <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                {uiError}
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <div
              className={`rounded-[32px] border ${theme.border} ${theme.card} ${theme.glow} p-6 md:p-8`}
            >
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] ${theme.badge}`}
                >
                  {response?.badge || "Door"}
                </span>

                {response?.result ? (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    {response.result}
                  </span>
                ) : null}

                {response?.debug?.source ? (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    source: {response.debug.source}
                  </span>
                ) : null}

                {response?.debug?.matched_by ? (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    match: {response.debug.matched_by}
                  </span>
                ) : null}

                {syncing ? (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    syncing...
                  </span>
                ) : null}
              </div>

              {response?.result === "OK_PRIORITY" ||
              response?.member?.door_role === "loyalty" ? (
                <div className="mb-4 rounded-2xl border border-yellow-300/40 bg-yellow-300/15 px-4 py-3 text-center">
                  <div className="text-xs font-bold uppercase tracking-[0.25em] text-yellow-200">
                    Accesso privilegiato
                  </div>
                  <div className="mt-1 text-lg font-semibold text-yellow-100">
                    Priority Pass
                  </div>
                </div>
              ) : null}

              <div
                className={`text-4xl font-semibold tracking-tight md:text-7xl ${theme.title}`}
              >
                {bigTitle}
              </div>

              <div className={`mt-3 text-lg md:text-2xl ${theme.accent}`}>
                {bigMessage}
              </div>

              {response?.person?.full_name ? (
                <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Persona
                  </div>
                  <div className="mt-2 text-2xl font-semibold md:text-4xl">
                    {response.person.full_name}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {response.person.email || "—"}
                    {response.person.phone ? ` · ${response.person.phone}` : ""}
                  </div>
                </div>
              ) : null}

              {response?.action === "OPEN_WALLY" ? (
                <a
                  href={response.action_url || "/wally"}
                  className="mt-6 inline-flex rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold transition hover:bg-white/15"
                >
                  Apri Wally
                </a>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
                <div className="mb-3 text-sm font-semibold text-slate-300">
                  Dati socio
                </div>
                {row("Door role", response?.member?.door_role)}
                {row("Gruppo", response?.member?.membership_group)}
                {row("Status", response?.member?.status)}
                {row("Scadenza", response?.member?.membership_expires_at)}
                {row("Member ID", response?.member?.id)}
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
                <div className="mb-3 text-sm font-semibold text-slate-300">
                  Dati ticket
                </div>
                {row("QR", response?.ticket?.qr_code)}
                {row("Ticket source", response?.ticket?.source)}
                {row("Stato ticket", response?.ticket?.status)}
                {row(
                  "Checked in",
                  String(response?.ticket?.checked_in ?? false)
                )}
                {row("Offer type", response?.ticket?.offer_type)}
                {row("Offer name", response?.ticket?.offer_name)}
                {row("Booking ID", response?.ticket?.booking_id)}
                {row("Transaction", response?.ticket?.transaction_id)}
                {row("Event ID", response?.ticket?.event_id)}
                {row("Nome ticket", response?.ticket?.full_name)}
                {row("Email ticket", response?.ticket?.email)}
                {row("Buyer email", response?.ticket?.buyer_email)}
              </div>

              {response?.booking ? (
                <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl xl:col-span-2">
                  <div className="mb-3 text-sm font-semibold text-slate-300">
                    Booking progress
                  </div>
                  {row("Booking ID", response.booking.booking_id)}
                  {row("Totale ticket", String(response.booking.ticket_count))}
                  {row("Entrati", String(response.booking.checked_in_count))}
                  {row("Progress", response.booking.progress_label)}
                </div>
              ) : null}

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl xl:col-span-2">
                <div className="mb-3 text-sm font-semibold text-slate-300">
                  Policy evento
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Require ticket
                    </div>
                    <div className="mt-2 text-xl font-semibold">
                      {String(response?.event?.require_ticket ?? false)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Require membership
                    </div>
                    <div className="mt-2 text-xl font-semibold">
                      {String(response?.event?.require_membership ?? false)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Require active
                    </div>
                    <div className="mt-2 text-xl font-semibold">
                      {String(
                        response?.event?.require_active_membership ?? false
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  {row("Evento locale", response?.event?.id)}
                  {row("Xceed UUID", response?.event?.xceed_event_uuid)}
                  {row("Xceed ref", response?.event?.xceed_event_ref)}
                </div>
              </div>

              {response?.error ? (
                <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200 xl:col-span-2">
                  {response.error}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}