"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isProbablyNotFoundErr(e: unknown) {
  const msg = String((e as any)?.message || e || "");
  // ZXing spesso usa "NotFoundException" come testo, oppure frasi simili.
  return /notfound/i.test(msg) || /detect the code/i.test(msg);
}

function isSecureContextOk() {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  // iOS: in pratica serve HTTPS. In locale può essere instabile.
  return window.isSecureContext || h === "localhost" || h === "127.0.0.1";
}

async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 2500) {
  const start = Date.now();

  // 1) loadedmetadata
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      const onMeta = () => {
        video.removeEventListener("loadedmetadata", onMeta);
        resolve();
      };
      video.addEventListener("loadedmetadata", onMeta, { once: true });
      // fallback timeout
      setTimeout(() => {
        video.removeEventListener("loadedmetadata", onMeta);
        resolve();
      }, Math.min(timeoutMs, 900));
    });
  }

  // 2) try play with small retries (Safari iOS sometimes needs a moment)
  while (Date.now() - start < timeoutMs) {
    try {
      // play() può lanciare DOMException su iOS se non pronto
      await video.play();
      break;
    } catch {
      await sleep(120);
    }
  }

  // 3) wait for "playing" or "canplay"
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("playing", finish);
      video.removeEventListener("canplay", finish);
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

  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);

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

  const stopScanner = () => {
    scanningRef.current = false;

    try {
      // reset() esiste ma i typings possono non includerlo -> cast any
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

  useEffect(() => {
    try {
      setPinOk(localStorage.getItem(LS_KEY) === "1");
    } catch {
      setPinOk(false);
    }
  }, []);

  useEffect(() => {
    return () => stopScanner();
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
    const eid = eventId.trim();
    const did = deviceId.trim();
    const code = (forcedQr ?? qr).trim();

    if (!eid || !code) {
      setRes({ ok: false, error: "Compila event_id e QR/Barcode." });
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
      setScanErr(
        "Camera non disponibile: su iPhone/iPad serve HTTPS. Testa su Vercel."
      );
      setScanStarting(false);
      return;
    }

    // NON chiamare stopScanner() prima di aprire: su iOS può creare flash/chiusura.
    scanningRef.current = false;
    setScanOpen(true);

    // aspetta mount <video>
    await sleep(80);

    const video = videoRef.current;
    if (!video) {
      setScanErr("Video non pronto (ref nullo). Riprova.");
      setScanStarting(false);
      setScanOpen(false);
      return;
    }

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }

    try {
      // iOS: meglio settare proprietà/attributi prima di stream
      video.setAttribute("playsinline", "true");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;

      // attende davvero che Safari stia riproducendo (importantissimo su iOS)
      await waitForVideoReady(video, 2800);

      const reader = readerRef.current as any;
      scanningRef.current = true;
      setScanStarting(false);

      // Avvio decoder (fallback se la funzione non esiste nella build)
      const startDecode =
        reader.decodeFromVideoElementContinuously ||
        reader.decodeFromVideoElement ||
        null;

      if (!startDecode) {
        setScanErr("ZXing: funzione decoder non disponibile.");
        stopScanner();
        return;
      }

      // Continuously: callback ripetuta (preferito)
      if (reader.decodeFromVideoElementContinuously) {
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
      } else {
        // Fallback: prova decodeFromVideoElement (non continuously)
        // Qui NON blocchiamo UI: lasciamo camera aperta e l’operatore può inserire a mano se serve.
        reader
          .decodeFromVideoElement(video)
          .then((result: any) => {
            const text = String(result?.getText?.() ?? "").trim();
            if (!text) return;

            setQr(text);
            setScanOpen(false);
            setScanErr(null);

            if (autoSubmitOnScan && eventId.trim()) {
              setTimeout(() => doCheck(text), 50);
            }
          })
          .catch((e: any) => {
            if (!isProbablyNotFoundErr(e)) {
              setScanErr(String(e?.message || e));
            }
          })
          .finally(() => {
            setScanStarting(false);
          });
      }
    } catch (e: any) {
      setScanErr(
        e?.message ||
          "Permesso camera negato o camera non disponibile (su iOS serve HTTPS)."
      );
      setScanStarting(false);
      // lascia scanOpen = true solo se vuoi mostrare riquadro nero; qui chiudiamo
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
                  <div className="text-xs text-white/60 mb-1">event_id</div>
                  <input
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    placeholder="UUID evento"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  />
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

                {scanOpen ? (
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    ✕ Chiudi scanner
                  </button>
                ) : null}

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

              {scanOpen ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs text-white/60 mb-2">
                    Inquadra il QR/Barcode
                  </div>
                  <video
                    ref={videoRef}
                    className="w-full rounded-xl border border-white/10 bg-black"
                    playsInline
                    muted
                    autoPlay
                  />
                  <div className="mt-2 text-[11px] text-white/40">
                    iPhone/iPad: serve HTTPS. In locale può “flashare” o non mostrare video.
                  </div>
                  <div className="mt-1 text-[11px] text-white/40">
                    Nota: lo scan può funzionare anche senza event_id; il check invece richiede event_id.
                  </div>
                </div>
              ) : null}

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
                  Reset scan
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
    </main>
  );
}
