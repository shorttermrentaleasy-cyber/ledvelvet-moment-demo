"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

/**
 * MVP PIN ingresso
 * (hardcoded apposta – lo renderemo gestibile da admin più avanti)
 */
const DOOR_PIN = "1979";
const LS_KEY = "doorcheck_pin_ok";

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

type MetaEvent = {
  id: string; // UUID evento (quello giusto per /api/doorcheck)
  name?: string | null;
  start_at?: string | null; // ISO
  city?: string | null;
  venue?: string | null;
};

function isSecureContextOk() {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return window.isSecureContext || h === "localhost" || h === "127.0.0.1";
}

function fmtEventLabel(ev: MetaEvent) {
  const parts: string[] = [];
  if (ev.name) parts.push(ev.name);

  if (ev.start_at) {
    try {
      const d = new Date(ev.start_at);
      parts.push(d.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }));
    } catch {}
  }

  const loc: string[] = [];
  if (ev.city) loc.push(ev.city);
  if (ev.venue) loc.push(ev.venue);
  if (loc.length) parts.push(loc.join(" · "));

  return parts.join(" — ") || ev.id;
}

function isProbablyNotFoundErr(e: unknown) {
  const msg = String((e as any)?.message || e || "");
  return /notfound/i.test(msg) || /detect/i.test(msg) || /no barcode/i.test(msg);
}

export default function DoorCheckPage() {
  // eventi (dropdown)
  const [events, setEvents] = useState<MetaEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsErr, setEventsErr] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");

  // doorcheck fields
  const [deviceId, setDeviceId] = useState("ipad-ingresso-1");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<DoorcheckResponse | null>(null);

  // PIN state
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);

  // camera scan
  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scanStarting, setScanStarting] = useState(false);
  const [autoSubmitOnScan, setAutoSubmitOnScan] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanningRef = useRef(false);

  const allowed = useMemo(
    () => (res && "allowed" in res ? res.allowed : false),
    [res]
  );

  // blocca scroll pagina quando scanner aperto (così non perdi il QR in vista)
  useEffect(() => {
    if (!scanOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scanOpen]);

  // load pinOk
  useEffect(() => {
    try {
      setPinOk(localStorage.getItem(LS_KEY) === "1");
    } catch {
      setPinOk(false);
    }
  }, []);

  // load events (dropdown)
  useEffect(() => {
    let alive = true;

    async function load() {
      setEventsLoading(true);
      setEventsErr(null);
      try {
        // Deve restituire eventi SUPABASE con id UUID (non recXXXX)
        const r = await fetch("/api/meta/events", { cache: "no-store" });
        const j = await r.json();

        const list: MetaEvent[] =
          (j?.events as MetaEvent[]) ||
          (j?.data as MetaEvent[]) ||
          [];

        if (!alive) return;

        setEvents(Array.isArray(list) ? list : []);
        // se c’è almeno un evento, pre-seleziona il primo (comodo in cassa)
        if (!selectedEventId && Array.isArray(list) && list.length > 0) {
          setSelectedEventId(String(list[0].id || "").trim());
        }
      } catch (e: any) {
        if (!alive) return;
        setEventsErr(e?.message || "Errore caricamento eventi");
        setEvents([]);
      } finally {
        if (!alive) return;
        setEventsLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkPin() {
    if (pin.trim() === DOOR_PIN) {
      try {
        localStorage.setItem(LS_KEY, "1");
      } catch {}
      setPinOk(true);
      setPin("");
    } else {
      alert("PIN errato");
    }
  }

  function resetPin() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    setPin("");
    setPinOk(false);
    setRes(null);
    setQr("");
    stopScanner();
  }

  async function doCheck(forcedQr?: string) {
    const eid = selectedEventId.trim();
    const did = deviceId.trim();
    const code = (forcedQr ?? qr).trim();

    if (!eid) {
      setRes({ ok: false, error: "Seleziona un evento (event_id obbligatorio)." });
      return;
    }
    if (!code) {
      setRes({ ok: false, error: "Inserisci/scansiona un QR o barcode." });
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

      // UX: se ok, pulisci campo
      if (data && "allowed" in data && data.allowed) setQr("");
    } catch (e: any) {
      setRes({ ok: false, error: e?.message || "Errore rete" });
    } finally {
      setLoading(false);
    }
  }

  const stopScanner = () => {
    scanningRef.current = false;

    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;

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

  // cleanup on unmount
  useEffect(() => {
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startScanner() {
    if (scanStarting) return;

    setScanErr(null);
    setScanStarting(true);

    if (!isSecureContextOk()) {
      setScanErr("Camera non disponibile: su iPhone/iPad serve HTTPS. Testa su Vercel.");
      setScanStarting(false);
      return;
    }

    // chiudi eventuale sessione precedente
    stopScanner();

    setScanOpen(true);

    // aspetta mount del video
    await new Promise((r) => setTimeout(r, 60));

    const video = videoRef.current;
    if (!video) {
      setScanErr("Video non pronto. Riprova.");
      setScanStarting(false);
      setScanOpen(false);
      return;
    }

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();

    try {
      video.setAttribute("playsinline", "true");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;

      scanningRef.current = true;

      // decoder robusto (iOS/Android): decodeFromConstraints + controls.stop()
      const controls = await readerRef.current.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        } as any,
        video,
        (result, err) => {
          if (!scanningRef.current) return;

          if (result) {
            const text = String(result.getText?.() ?? "").trim();
            if (!text) return;

            // chiudi scanner + applica valore
            scanningRef.current = false;
            setQr(text);
            setScanErr(null);
            setScanOpen(false);

            // stop fisico camera
            try {
              controlsRef.current?.stop();
            } catch {}

            // auto submit SOLO se evento selezionato
            if (autoSubmitOnScan && selectedEventId.trim()) {
              setTimeout(() => doCheck(text), 50);
            }
            return;
          }

          if (err && !isProbablyNotFoundErr(err)) {
            setScanErr(String((err as any)?.message || err));
          }
        }
      );

      controlsRef.current = controls;
      setScanStarting(false);
    } catch (e: any) {
      setScanErr(
        e?.message ||
          "Permesso camera negato o camera non disponibile (su iOS serve HTTPS)."
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
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  >
                    <option value="">— Seleziona evento —</option>

                    {!eventsLoading && events.length === 0 ? (
                      <option value="">
                        Nessun evento disponibile (o API non risponde)
                      </option>
                    ) : null}

                    {eventsLoading ? (
                      <option value="">Caricamento eventi...</option>
                    ) : (
                      events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {fmtEventLabel(ev)}
                        </option>
                      ))
                    )}
                  </select>
                  {eventsErr ? (
                    <div className="mt-2 text-xs text-red-300">
                      Errore eventi: {eventsErr}
                    </div>
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
                  {scanStarting ? "📷 Avvio camera..." : "📷 Scan (camera)"}
                </button>

                <label className="flex items-center gap-2 text-xs text-white/60 select-none">
                  <input
                    type="checkbox"
                    checked={autoSubmitOnScan}
                    onChange={(e) => setAutoSubmitOnScan(e.target.checked)}
                  />
                  auto-check dopo scan
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
                  autoFocus
                />
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

              <div className="mt-3 text-[11px] text-white/40">
                Nota: lo scan può partire anche senza evento selezionato, ma il check-in richiede l’evento.
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
                  {res.member && (
                    <div className="mt-3 text-sm">
                      {res.member.first_name} {res.member.last_name}{" "}
                      {res.member.legacy ? "(legacy)" : null}
                    </div>
                  )}
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

      {/* ===== OVERLAY SCANNER (compatto, niente scroll) ===== */}
      {scanOpen ? (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-black/70 p-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="text-sm text-white/70">Inquadra il QR/Barcode</div>
              <button
                type="button"
                onClick={stopScanner}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                ✕ Chiudi
              </button>
            </div>

            <div className="mt-2 rounded-xl border border-white/10 bg-black overflow-hidden">
              <video
                ref={videoRef}
                className="w-full"
                style={{ height: "55vh", objectFit: "cover" }}
                playsInline
                muted
                autoPlay
              />
            </div>

            <div className="mt-2 text-[11px] text-white/40 px-1">
              Suggerimento: aumenta luminosità e avvicinati al QR. (iOS: su HTTPS va molto meglio.)
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
