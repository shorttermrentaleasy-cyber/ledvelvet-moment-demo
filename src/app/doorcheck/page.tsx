"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

const DOOR_PIN = "1979";
const LS_KEY = "doorcheck_pin_ok";
const LS_KEY_API = "doorcheck_api_key";

type DoorcheckOkResponse = {
  ok: true;
  allowed: boolean;

  // scan flow (ETS)
  reason?: string;
  method?: string;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string | null;
    legacy?: boolean;
  };

  // unified additions (RPC/manual flow)
  kind?: "ETS" | "SRL" | "XCEED" | "UNKNOWN";
  status?: string;
  checkin_id?: string | null;
  legacy_person_id?: string | null;

  // ✅ extra (senza cambiare UI)
  display_name?: string | null;
};

type DoorcheckResponse = DoorcheckOkResponse | { ok: false; error: string };

type PublicEvent = {
  id: string;
  name: string;
  start_at?: string | null;
  city?: string | null;
  venue?: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isSecureContextOk() {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return window.isSecureContext || h === "localhost" || h === "127.0.0.1";
}

function isProbablyNotFoundErr(e: unknown) {
  const msg = String((e as any)?.message || e || "");
  return /notfound/i.test(msg) || /no multi/i.test(msg) || /detect the code/i.test(msg);
}

function fmtEventLabel(e: PublicEvent) {
  const bits: string[] = [];
  if (e.start_at) {
    try {
      bits.push(new Date(e.start_at).toLocaleString("it-IT"));
    } catch {}
  }
  if (e.city) bits.push(e.city);
  if (e.venue) bits.push(e.venue);
  return bits.length ? `${e.name} · ${bits.join(" · ")}` : e.name;
}

function truthy(s?: string) {
  const t = (s || "").trim();
  return t.length ? t : null;
}

export default function DoorCheckPage() {
  const [eventId, setEventId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [eventsErr, setEventsErr] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [deviceId, setDeviceId] = useState("ipad-ingresso-1");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<DoorcheckResponse | null>(null);

  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [apiKeyOk, setApiKeyOk] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [autoSubmitOnScan, setAutoSubmitOnScan] = useState(true);
  const [scanStarting, setScanStarting] = useState(false);

  // manual SRL UI
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [lastDeniedCode, setLastDeniedCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const allowed = useMemo(() => {
    return res && "allowed" in res ? !!res.allowed : false;
  }, [res]);

  const denyReason = useMemo(() => {
    if (!res || !("ok" in res) || !res.ok) return null;
    const r = (res.reason || "").trim();
    return r || null;
  }, [res]);

  const canOfferManual = useMemo(() => {
    if (!res || !("ok" in res) || !res.ok) return false;
    if (res.allowed) return false;
    const r = (res.reason || "").trim();
    return r === "invalid_qr" || r === "invalid_barcode";
  }, [res]);

  const currentEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const stopScanner = () => {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;

    const video = videoRef.current;
    if (video) {
      try {
        const tracks = (video.srcObject as MediaStream | null)?.getTracks?.() || [];
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

  // iOS: overflow hidden blocca anche lo scroll della pagina quando la camera è aperta.
  // Quindi NON blocchiamo lo scroll globale.
  useEffect(() => {
    if (!scanOpen) return;
    const prevOverscroll = (document.body.style as any).overscrollBehavior;
    (document.body.style as any).overscrollBehavior = "contain";
    return () => {
      (document.body.style as any).overscrollBehavior = prevOverscroll;
    };
  }, [scanOpen]);

  useEffect(() => {
    try {
      setPinOk(localStorage.getItem(LS_KEY) === "1");
    } catch {
      setPinOk(false);
    }
    try {
      const k = localStorage.getItem(LS_KEY_API) || "";
      setApiKey(k);
      setApiKeyOk(!!k.trim());
    } catch {
      setApiKey("");
      setApiKeyOk(false);
    }
  }, []);

  useEffect(() => {
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // carica eventi quando pinOk
  useEffect(() => {
    if (!pinOk) return;

    let cancelled = false;

    (async () => {
      setEventsLoading(true);
      setEventsErr(null);
      try {
        const r = await fetch("/api/public/door-events", { cache: "no-store" });
        const j = await r.json();

        // supporta 2 formati comuni: {events:[...]} oppure [...]
        const list = Array.isArray(j) ? j : Array.isArray(j?.events) ? j.events : [];

        const mapped: PublicEvent[] = (list || [])
          .map((x: any) => ({
            id: String(x.id || x.event_id || ""),
            name: String(x.name || x.title || "Evento"),
            start_at: x.start_at || x.starts_at || x.date || null,
            city: x.city || null,
            venue: x.venue || x.location || null,
          }))
          .filter((x: PublicEvent) => !!x.id);

        if (!cancelled) {
          setEvents(mapped);
          if (!selectedEventId && mapped.length) {
            setSelectedEventId(mapped[0].id);
            setEventId(mapped[0].id);
          }
        }
      } catch (e: any) {
        if (!cancelled) setEventsErr(e?.message || "Errore caricamento eventi");
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinOk]);

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
    setSelectedEventId("");
    setEventId("");
    stopScanner();
  }

  async function saveApiKey() {
    // ✅ regola d'oro: ogni request usa SEMPRE localStorage
    const typed = apiKey.trim();
    if (!typed) {
      alert("Inserisci la Door API Key");
      return;
    }

    // scrivo prima la key (così anche il ping legge da LS)
    try {
      localStorage.setItem(LS_KEY_API, typed);
    } catch {}

    const k = (localStorage.getItem(LS_KEY_API) || "").trim();
    if (!k) {
      alert("Impossibile salvare la Door API Key su questo dispositivo.");
      setApiKeyOk(false);
      return;
    }

    const r = await fetch("/api/doorcheck/ping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": k,
      },
      cache: "no-store",
    });

    if (!r.ok) {
      alert("❌ API Key non valida");
      setApiKeyOk(false);
      return;
    }

    setApiKey(k);
    setApiKeyOk(true);
    setRes(null);
    setLastDeniedCode(null);
    alert("✅ API Key valida e salvata");
  }

  function clearApiKey() {
    try {
      localStorage.removeItem(LS_KEY_API);
    } catch {}
    setApiKey("");
    setApiKeyOk(false);
    alert("Door API Key rimossa");
  }

  async function doCheck(forcedQr?: string) {
    const eid = eventId.trim();
    const did = deviceId.trim();
    const code = (forcedQr ?? qr).trim();

    if (!eid || !code) {
      setRes({ ok: false, error: "Seleziona un evento e scansiona/incolla il codice." });
      return;
    }
    if (!apiKeyOk) {
      setRes({ ok: false, error: "Manca la Door API Key (salvala sopra)." });
      return;
    }

    setLoading(true);
    setRes(null);
    setManualOpen(false);
    setLastDeniedCode(null);

    try {
      // ✅ SEMPRE da localStorage (non dallo state)
      const k = (localStorage.getItem(LS_KEY_API) || "").trim();
      if (!k) {
        setRes({ ok: false, error: "Manca la Door API Key (salvala sopra)." });
        return;
      }

      const r = await fetch("/api/doorcheck", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": k,
        },
        cache: "no-store",
        body: JSON.stringify({
          event_id: eid,
          qr: code,
          device_id: did || undefined,
        }),
      });

      const data = (await r.json()) as DoorcheckResponse;
      setRes(data);

      if (data && "ok" in data && data.ok && !data.allowed) {
        const rr = (data.reason || "").trim();
        if (rr === "invalid_qr" || rr === "invalid_barcode") {
          setLastDeniedCode(code);
        }
      }

      if (data && "ok" in data && data.ok && data.allowed) setQr("");
    } catch (e: any) {
      setRes({ ok: false, error: e?.message || "Errore rete" });
    } finally {
      setLoading(false);
    }
  }

  async function doManualCheck() {
    const eid = eventId.trim();
    if (!eid) {
      setRes({ ok: false, error: "Seleziona un evento prima." });
      return;
    }
    if (!apiKeyOk) {
      setRes({ ok: false, error: "Manca la Door API Key (salvala sopra)." });
      return;
    }

    const full_name = truthy(manualName);
    const phone = truthy(manualPhone);
    const email = truthy(manualEmail);

    if (!full_name && !phone) {
      setRes({ ok: false, error: "Inserisci almeno Nome oppure Telefono." });
      return;
    }

    setManualLoading(true);
    setRes(null);

    try {
      const scanned = truthy(lastDeniedCode || "") || (phone ? `MANUAL:${phone}` : "MANUAL");

      // ✅ SEMPRE da localStorage (non dallo state)
      const k = (localStorage.getItem(LS_KEY_API) || "").trim();
      if (!k) {
        setManualLoading(false);
        setRes({ ok: false, error: "Manca la Door API Key (salvala sopra)." });
        return;
      }

      const r = await fetch("/api/doorcheck", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": k,
        },
        cache: "no-store",
        body: JSON.stringify({
          event_id: eid,
          mode: "manual",
          full_name: full_name || undefined,
          phone: phone || undefined,
          email: email || undefined,
          qr: scanned,
        }),
      });

      const data = (await r.json()) as DoorcheckResponse;
      setRes(data);

      setManualOpen(false);
      setManualName("");
      setManualPhone("");
      setManualEmail("");
      setLastDeniedCode(null);
    } catch (e: any) {
      setRes({ ok: false, error: e?.message || "Errore rete" });
    } finally {
      setManualLoading(false);
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

    stopScanner();
    setScanOpen(true);

    await sleep(120);

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

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      controlsRef.current = await readerRef.current.decodeFromConstraints(constraints, video, (result, err) => {
        if (result) {
          const text = result.getText()?.trim();
          if (!text) return;

          setQr(text);

          if (autoSubmitOnScan && eventId.trim()) {
            stopScanner();
            setTimeout(() => doCheck(text), 80);
          }
          return;
        }

        if (err && !isProbablyNotFoundErr(err)) {
          setScanErr(String((err as any)?.message || err));
        }
      });

      setScanStarting(false);
    } catch (e: any) {
      setScanErr(e?.message || "Permesso camera negato o camera non disponibile.");
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
            <p className="mt-1 text-white/60 text-sm">Controllo ingressi – QR / Barcode (MVP)</p>
          </div>
          <span className="text-xs text-white/40 border border-white/10 rounded-full px-3 py-1">/doorcheck</span>
        </header>

        {!pinOk && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Accesso staff</h2>
            <p className="mt-1 text-sm text-white/60">Inserisci il PIN per abilitare il controllo ingressi.</p>

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
              <button onClick={checkPin} className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold">
                Sblocca
              </button>
            </div>
          </section>
        )}

        {pinOk && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              {/* Door API Key */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold">Door API Key</div>
                <div className="mt-1 text-xs text-white/60">
                  Inseriscila una volta (salvata su questo dispositivo). Non viene messa nel codice.
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      // ✅ se la modifichi, non è più "validata" finché non fai Salva/ping
                      setApiKeyOk(false);
                    }}
                    placeholder="x-api-key..."
                    className="flex-1 min-w-[240px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30 font-mono"
                    type="password"
                  />
                  <button
                    type="button"
                    onClick={saveApiKey}
                    className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
                  >
                    Salva
                  </button>
                  <button
                    type="button"
                    onClick={clearApiKey}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    Rimuovi
                  </button>
                </div>

                {!apiKeyOk ? (
                  <div className="mt-2 text-[11px] text-red-300">Manca Door API Key: senza non puoi fare check-in.</div>
                ) : (
                  <div className="mt-2 text-[11px] text-emerald-300">OK: Door API Key presente su questo dispositivo.</div>
                )}
              </div>

              {/* Dropdown eventi */}
              <label className="block mt-4">
                <div className="text-xs text-white/60 mb-1">Evento</div>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedEventId(id);
                    setEventId(id);
                    setRes(null);
                    setManualOpen(false);
                    setLastDeniedCode(null);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/30"
                >
                  {!eventsLoading && events.length === 0 ? (
                    <option value="">Nessun evento disponibile (o API non risponde)</option>
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

                <div className="mt-2 text-[11px] text-white/40">
                  {eventsErr ? (
                    <span className="text-red-300">{eventsErr}</span>
                  ) : (
                    <>Selezionando un evento, l’UUID viene usato per il check-in.</>
                  )}
                </div>
              </label>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-white/60 mb-1">event_id (auto)</div>
                  <input
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    placeholder="UUID evento"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30 font-mono"
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
                  disabled={scanStarting || !apiKeyOk}
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

                {scanErr ? <span className="text-xs text-red-300">{scanErr}</span> : null}
              </div>

              {scanOpen ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs text-white/60 mb-2">Inquadra il QR/Barcode</div>
                  <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full"
                      style={{ height: "38vh", objectFit: "cover" }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-white/40">
                    iPhone/iPad: serve HTTPS (Vercel). In locale può essere instabile.
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
                  disabled={!apiKeyOk}
                />
              </label>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => doCheck()}
                  disabled={loading || !apiKeyOk}
                  className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Controllo..." : "Check"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRes(null);
                    setQr("");
                    setManualOpen(false);
                    setLastDeniedCode(null);
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  Reset scan
                </button>

                <button type="button" onClick={resetPin} className="ml-auto text-xs text-white/40 underline">
                  Reset PIN
                </button>
              </div>

              {/* CTA manual SRL */}
              {canOfferManual && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold">Codice non riconosciuto</div>
                  <div className="mt-1 text-xs text-white/60">
                    Vuoi far entrare un ospite non socio? Inserisci i dati al volo e registra l’accesso come SRL.
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setManualOpen(true);
                        setManualName("");
                        setManualPhone("");
                        setManualEmail("");
                      }}
                      className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
                    >
                      ➕ Inserisci ospite manuale
                    </button>
                    <span className="text-[11px] text-white/40 font-mono">scanned_code: {lastDeniedCode || "(n/a)"}</span>
                  </div>
                </div>
              )}

              {/* FORM manual SRL */}
              {manualOpen && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-sm font-semibold">Ospite (SRL) – inserimento rapido</div>
                  <div className="mt-1 text-xs text-white/60">Minimo: Nome oppure Telefono. (Consigliato: entrambi)</div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Nome e cognome"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                    />
                    <input
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                      placeholder="Telefono"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                      inputMode="tel"
                    />
                    <input
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="Email (opzionale)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                      inputMode="email"
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={doManualCheck}
                      disabled={manualLoading}
                      className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      {manualLoading ? "Registrazione..." : "Registra ingresso SRL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualOpen(false)}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-4">
              {!res ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                  Nessun controllo ancora.
                </div>
              ) : "ok" in res && res.ok ? (
                (() => {
                  const resAny = res as any;
                  const allowedNow = !!resAny.allowed;

                  const isDenied = !allowedNow;
                  const denyReasonEff = String(resAny?.reason || denyReason || "").trim();

                  const ticketUrl = String((currentEvent as any)?.ticketUrl || "").trim();
                  const membershipUrl = String((currentEvent as any)?.membershipUrl || "").trim();

                  const canOfferBuyTicket = isDenied && denyReasonEff === "missing_ticket" && !!ticketUrl;

                  const canOfferSrlFromTicket =
                    isDenied && (denyReasonEff === "not_a_member" || denyReasonEff === "membership_required");

                  const canOfferMembershipCta =
                    isDenied && (denyReasonEff === "not_a_member" || denyReasonEff === "membership_required");

                  return (
                    <div
                      className={`rounded-2xl border p-5 ${
                        allowedNow ? "border-emerald-400/30 bg-emerald-400/10" : "border-red-400/30 bg-red-400/10"
                      }`}
                    >
                      <div className="text-lg font-semibold">{allowedNow ? "✅ ACCESSO OK" : "⛔ ACCESSO NEGATO"}</div>

                      <div className="mt-2 text-sm font-mono">
                        {resAny.kind ? `kind: ${resAny.kind}` : null}
                        {resAny.kind ? " · " : ""}
                        {resAny.status ? `status: ${resAny.status}` : null}
                        {(resAny.reason || denyReason) ? ` · reason: ${String(resAny.reason || denyReason).trim()}` : ""}
                      </div>

                      {resAny.display_name ? <div className="mt-1 text-white/80">name: {resAny.display_name}</div> : null}

                      {/* CTA azioni staff su denied */}
                      {isDenied ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          {canOfferBuyTicket ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!ticketUrl) return;
                                window.open(ticketUrl, "_blank", "noopener,noreferrer");
                              }}
                              className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
                            >
                              🎟️ Apri acquisto biglietto
                            </button>
                          ) : null}

                          {canOfferMembershipCta ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (membershipUrl) {
                                  window.open(membershipUrl, "_blank", "noopener,noreferrer");
                                  return;
                                }
                                alert("Procedura: iscrizione/rinnovo ETS (verifica con staff).");
                              }}
                              className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
                            >
                              🪪 Diventa socio ETS
                            </button>
                          ) : null}

                          {canOfferSrlFromTicket ? (
                            <button
                              type="button"
                              onClick={() => {
                                setManualOpen(true);
                                setManualName(resAny?.display_name || "");
                                setManualPhone("");
                                setManualEmail("");
                              }}
                              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                            >
                              ➕ Passa a SRL (ospite manuale)
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {resAny.checkin_id ? (
                        <div className="mt-2 text-[11px] text-white/40 font-mono">checkin_id: {resAny.checkin_id}</div>
                      ) : null}

                      {resAny.legacy_person_id ? (
                        <div className="mt-2 text-[11px] text-white/40 font-mono">
                          legacy_person_id: {resAny.legacy_person_id}
                        </div>
                      ) : null}

                      {resAny.member ? (
                        <div className="mt-3 text-sm">
                          {resAny.member.first_name} {resAny.member.last_name} {resAny.member.legacy ? "(legacy)" : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
                  <div className="text-lg font-semibold">Errore</div>
                  <div className="mt-2 text-sm font-mono">{(res as any).error}</div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
