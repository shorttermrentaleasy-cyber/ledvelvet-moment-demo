"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const DOOR_PIN = "1979";
const LS_PIN = "doorcheck_pin_ok";
const LS_EVENT = "doorcheck_event_id";

type DoorcheckResponse =
  | {
      ok: true;
      allowed: boolean;
      reason: string;
      method?: string;
      member?: {
        id: string;
        first_name: string;
        last_name: string;
        email?: string | null;
        legacy?: boolean;
      };
    }
  | { ok: false; error: string };

type EventRow = { id: string; name: string };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isProbablyNotFoundErr(e: unknown) {
  const msg = String((e as any)?.message || e || "");
  return /notfound/i.test(msg) || /detect the code/i.test(msg);
}

function isSecureContextOk() {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return window.isSecureContext || h === "localhost" || h === "127.0.0.1";
}

async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 2500) {
  const start = Date.now();

  // loadedmetadata
  await new Promise<void>((resolve) => {
    if (video.videoWidth) return resolve();
    const onMeta = () => resolve();
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    setTimeout(() => resolve(), Math.min(timeoutMs, 900));
  });

  // play retry
  while (Date.now() - start < timeoutMs) {
    try {
      await video.play();
      break;
    } catch {
      await sleep(120);
    }
  }

  // playing/canplay
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    video.addEventListener("playing", finish, { once: true });
    video.addEventListener("canplay", finish, { once: true });
    setTimeout(() => finish(), Math.min(timeoutMs, 900));
  });
}

export default function DoorCheckPage() {
  const [eventId, setEventId] = useState("");
  const [deviceId, setDeviceId] = useState("ipad-ingresso-1");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<DoorcheckResponse | null>(null);

  // PIN
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);

  // Events dropdown
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsErr, setEventsErr] = useState<string | null>(null);

  // Scanner
  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [autoSubmitOnScan, setAutoSubmitOnScan] = useState(true);
  const [scanStarting, setScanStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);

  const allowed = useMemo(
    () => (res && "allowed" in res ? res.allowed : false),
    [res]
  );

  // blocca scroll quando modal aperta
  useEffect(() => {
    if (!scanOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scanOpen]);

  const stopScanner = () => {
    scanningRef.current = false;

    try {
      (readerRef.current as any)?.reset?.();
    } catch {}

    const video = videoRef.current;
    if (video) {
      try {
        const tracks =
          (video.srcObject as MediaStream | null)?.getTracks?.() || [];
        tracks.forEach((t) => t.stop());
      } catch {}
      try {
        video.srcObject = null;
      } catch {}
    }

    setScanOpen(false);
    setScanErr(null);
    setScanStarting(false);
  };

  // init pin + last event
  useEffect(() => {
    try {
      setPinOk(localStorage.getItem(LS_PIN) === "1");
      const last = localStorage.getItem(LS_EVENT) || "";
      if (last) setEventId(last);
    } catch {
      setPinOk(false);
    }
  }, []);

  // cleanup scanner
  useEffect(() => {
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkPin() {
    if (pin.trim() === DOOR_PIN) {
      try {
        localStorage.setItem(LS_PIN, "1");
      } catch {}
      setPinOk(true);
      setPin("");
      // carica eventi subito
      loadEvents();
    } else {
      alert("PIN errato");
    }
  }

  function resetPin() {
    try {
      localStorage.removeItem(LS_PIN);
    } catch {}
    setPin("");
    setPinOk(false);
    setRes(null);
    setQr("");
    stopScanner();
  }

  async function loadEvents() {
    setEventsErr(null);
    setEventsLoading(true);
    try {
      const r = await fetch("/api/doorcheck-events", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Errore caricamento eventi");
      setEvents((j.events || []) as EventRow[]);
    } catch (e: any) {
      setEventsErr(e?.message || "Errore eventi");
    } finally {
      setEventsLoading(false);
    }
  }

  async function doCheck(forcedQr?: string) {
    const eid = eventId.trim();
    const did = deviceId.trim();
    const code = (forcedQr ?? qr).trim();

    if (!eid || !code) {
      setRes({ ok: false, error: "Seleziona evento e scansiona QR/Barcode." });
      return;
    }

    setLoading(true);
    setRes(null);

    try {
      const r = await fetch("/api/doorcheck-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          event_id: eid,
          qr: code,
          device_id: did || undefined,
        }),
      });

      const data = (await r.json()) as DoorcheckResponse;
      setRes(data);
      if (data && "allowed" in data && data.allowed) setQr("");
    } catch (e: any) {
      setRes({ ok: false, error: e?.message || "Errore rete" });
    } finally {
      setLoading(false);
    }
  }

  async function startScanner() {
    if (scanStarting) return;

    setScanErr(null);
    setScanStarting(true);

    if (!isSecureContextOk()) {
      setScanErr("Camera non disponibile: su iPhone/iPad serve HTTPS (Vercel).");
      setScanStarting(false);
      return;
    }

    scanningRef.current = false;
    setScanOpen(true);

    await sleep(80);

    const video = videoRef.current;
    if (!video) {
      setScanErr("Video non pronto. Riprova.");
      setScanStarting(false);
      setScanOpen(false);
      return;
    }

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }

    try {
      video.setAttribute("playsinline", "true");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;

      await waitForVideoReady(video, 2800);

      const reader = readerRef.current as any;
      scanningRef.current = true;
      setScanStarting(false);

      if (!reader.decodeFromVideoElementContinuously) {
        setScanErr("ZXing: decoder continuously non disponibile.");
        return;
      }

      reader.decodeFromVideoElementContinuously(
        video,
        (result: any, err: any) => {
          if (!scanningRef.current) return;

          if (result) {
            const text = String(result.getText?.() ?? "").trim();
            if (!text) return;

            // stop ordinato
            scanningRef.current = false;
            try {
              (readerRef.current as any)?.reset?.();
            } catch {}

            try {
              const tracks =
                (video.srcObject as MediaStream | null)?.getTracks?.() || [];
              tracks.forEach((t) => t.stop());
            } catch {}

            try {
              video.srcObject = null;
            } catch {}

            setScanOpen(false);
            setScanErr(null);
            setQr(text);

            if (autoSubmitOnScan && eventId.trim()) {
              setTimeout(() => doCheck(text), 50);
            }
            return;
          }

          if (err && !isProbablyNotFoundErr(err)) {
            setScanErr(String(err?.message || err));
          }
        }
      );
    } catch (e: any) {
      setScanErr(
        e?.message ||
          "Permesso camera negato o camera non disponibile (iOS: serve HTTPS)."
      );
      setScanStarting(false);
      setScanOpen(false);
      stopScanner();
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">DoorCheck</h1>
            <p className="mt-1 text-white/60 text-sm">
              Controllo ingressi – QR / Barcode (MVP)
            </p>
          </div>
          <span className="text-xs text-white/40 border border-white/10 rounded-full px-3 py-1">
            /doorcheck
          </span>
        </header>

        {!pinOk && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Accesso staff</h2>
            <p className="mt-1 text-sm text-white/60">
              Inserisci il PIN per abilitare il controllo ingressi.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN ingresso"
                className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") checkPin();
                }}
                autoFocus
              />
              <button
                onClick={checkPin}
                className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
              >
                Sblocca
              </button>
            </div>
          </section>
        )}

        {pinOk && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-white/60 mb-1">Evento</div>

                  <div className="flex gap-2">
                    <select
                      value={eventId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEventId(v);
                        try {
                          localStorage.setItem(LS_EVENT, v);
                        } catch {}
                      }}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                    >
                      <option value="">— Seleziona evento —</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={loadEvents}
                      disabled={eventsLoading}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                      title="Ricarica eventi"
                    >
                      {eventsLoading ? "..." : "↻"}
                    </button>
                  </div>

                  {eventsErr ? (
                    <div className="mt-2 text-xs text-red-300">{eventsErr}</div>
                  ) : null}
                </label>

                <label className="block">
                  <div className="text-xs text-white/60 mb-1">device_id</div>
                  <input
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="ipad-ingresso-1"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={startScanner}
                  disabled={scanStarting}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  {scanStarting ? "📷 Avvio..." : "📷 Scan (camera)"}
                </button>

                <label className="flex items-center gap-2 text-xs text-white/60 select-none">
                  <input
                    type="checkbox"
                    checked={autoSubmitOnScan}
                    onChange={(e) => setAutoSubmitOnScan(e.target.checked)}
                  />
                  auto-check dopo scan (solo se evento selezionato)
                </label>

                {scanErr ? (
                  <span className="text-xs text-red-300">{scanErr}</span>
                ) : null}
              </div>

              <label className="block mt-4">
                <div className="text-xs text-white/60 mb-1">QR / Barcode</div>
                <input
                  value={qr}
                  onChange={(e) => setQr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doCheck();
                  }}
                  placeholder="Scansiona o incolla qui (Enter)"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-base outline-none focus:border-white/30 font-mono"
                />
                <div className="mt-2 text-xs text-white/40">
                  Scanner “tastiera” supportato. Camera: premi “Scan (camera)”.
                </div>
              </label>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => doCheck()}
                  disabled={loading}
                  className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Controllo..." : "Check"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRes(null);
                    setQr("");
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={resetPin}
                  className="ml-auto text-xs text-white/40 underline"
                >
                  Reset PIN
                </button>
              </div>
            </section>

            <section className="mt-4">
              {!res ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                  Nessun controllo ancora.
                </div>
              ) : "ok" in res && res.ok ? (
                <div
                  className={`rounded-2xl border p-5 ${
                    allowed
                      ? "border-emerald-400/30 bg-emerald-400/10"
                      : "border-red-400/30 bg-red-400/10"
                  }`}
                >
                  <div className="text-lg font-semibold">
                    {allowed ? "✅ ACCESSO OK" : "⛔ ACCESSO NEGATO"}
                  </div>
                  <div className="mt-2 text-sm font-mono">
                    reason: {res.reason}
                    {res.method ? ` · method: ${res.method}` : ""}
                  </div>
                  {res.member ? (
                    <div className="mt-3 text-sm">
                      {res.member.first_name} {res.member.last_name}{" "}
                      {res.member.legacy ? "(legacy)" : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
                  <div className="text-lg font-semibold">Errore</div>
                  <div className="mt-2 text-sm font-mono">
                    {(res as any).error}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* ===== MODAL SCANNER (full-screen, no scroll) ===== */}
      {scanOpen ? (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm p-4">
          <div className="mx-auto max-w-2xl h-full flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-white/70">
                Inquadra QR / Barcode
              </div>
              <button
                type="button"
                onClick={stopScanner}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                ✕ Chiudi
              </button>
            </div>

            <div className="mt-3 flex-1 rounded-2xl border border-white/10 bg-black/40 p-3">
              <video
                ref={videoRef}
                className="w-full h-[70vh] rounded-xl border border-white/10 bg-black object-cover"
                playsInline
                muted
                autoPlay
              />
              <div className="mt-2 text-[11px] text-white/50">
                Tip: se non “aggancia” subito, avvicina/allontana e aumenta la luce.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
