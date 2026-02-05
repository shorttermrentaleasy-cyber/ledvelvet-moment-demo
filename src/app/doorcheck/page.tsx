"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

const DOOR_PIN = "1979";
const LS_KEY = "doorcheck_pin_ok";
const LS_KEY_API = "doorcheck_api_key";

type DoorcheckOkResponse = {
  ok: true;
  allowed: boolean;
  reason?: string;
  method?: string;

  kind?: "ETS" | "SRL" | "XCEED" | "UNKNOWN";
  status?: string;
  checkin_id?: string | null;
  legacy_person_id?: string | null;
  display_name?: string | null;

  message?: string | null;

  ticket_offer_title?: string | null;
  ticket_offer_description?: string | null;
  ticket_transaction_id?: string | null;
  ticket_booking_date?: string | null;
};

type DoorcheckResponse = DoorcheckOkResponse | { ok: false; error: string };

type PublicEvent = {
  id: string;
  name: string;
  start_at?: string | null;
  city?: string | null;
  venue?: string | null;
};

type AttendanceResp =
  | { ok: false; error: string }
  | {
      ok: true;
      event: {
        id: string;
        name: string;
        starts_at: string | null;
        require_ticket: boolean;
        require_membership: boolean;
      };
      summary: {
        tickets_total: number;
        tickets_checked_in: number;
        tickets_missing: number;
      };
      tickets_payload?: {
        view: "missing" | "entered" | "all";
        q: string;
        limit: number;
        offset: number;
        tickets_filtered_count: number;
        // opzionale: se non lo mandi dal backend lo calcolo io
        has_more?: boolean;
        tickets: Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          checkin_id: string | null;
          imported_at: string | null;
          offer_title: string | null;
          offer_description: string | null;
          transaction_id: string | null;
          booking_date: string | null;
        }>;
      };
      checkins_payload?: {
        kind: string; // ALL/ETS/SRL/XCEED
        q: string;
        limit: number;
        offset: number;
        has_more?: boolean;
        checkins_filtered_count: number | null;
        checkins: Array<{
          id: string;
          created_at: string;
          kind: string | null;
          method: string | null;
          result: string | null;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          scanned_code: string | null;
        }>;
        last_checkins?: Array<{
          id: string;
          created_at: string;
          kind: string | null;
          method: string | null;
          result: string | null;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          scanned_code: string | null;
        }>;
      };
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

function fmtTS(ts: string | null | undefined) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("it-IT");
  } catch {
    return String(ts);
  }
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

  // Attendance drawer
  const [attOpen, setAttOpen] = useState(false);
  const [attTab, setAttTab] = useState<"missing" | "entered" | "tickets">("missing");
  const [attQ, setAttQ] = useState("");
  const [attQDebounced, setAttQDebounced] = useState("");
  const [attKind, setAttKind] = useState<"ALL" | "ETS" | "SRL" | "XCEED">("ALL");
  const [attLoading, setAttLoading] = useState(false);
  const [attErr, setAttErr] = useState<string | null>(null);
  const [attData, setAttData] = useState<AttendanceResp | null>(null);

  // ✅ offsets separati (prima era il punto debole)
  const [ticketsOffset, setTicketsOffset] = useState(0);
  const [checkinsOffset, setCheckinsOffset] = useState(0);
  const [attLimit] = useState(200);
  const [attDebug, setAttDebug] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

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

  // debounce ricerca presenze
  useEffect(() => {
    const t = setTimeout(() => setAttQDebounced(attQ.trim()), 250);
    return () => clearTimeout(t);
  }, [attQ]);

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
          // ✅ ordine alfabetico eventi (se vuoi): commenta se preferisci per data
          mapped.sort((a, b) => (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" }));

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
    const typed = apiKey.trim();
    if (!typed) {
      alert("Inserisci la Door API Key");
      return;
    }

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
      headers: { "Content-Type": "application/json", "x-api-key": k },
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
      const k = (localStorage.getItem(LS_KEY_API) || "").trim();
      if (!k) {
        setRes({ ok: false, error: "Manca la Door API Key (salvala sopra)." });
        return;
      }

      const r = await fetch("/api/doorcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": k },
        cache: "no-store",
        body: JSON.stringify({ event_id: eid, qr: code, device_id: did || undefined }),
      });

      const data = (await r.json()) as DoorcheckResponse;
      setRes(data);

      if (data && "ok" in data && data.ok && !data.allowed) setLastDeniedCode(code);
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
      const k = (localStorage.getItem(LS_KEY_API) || "").trim();
      if (!k) {
        setManualLoading(false);
        setRes({ ok: false, error: "Manca la Door API Key (salvala sopra)." });
        return;
      }

      const r = await fetch("/api/doorcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": k },
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

  function resetAttendanceStateForNewQuery() {
    setAttData(null);
    setTicketsOffset(0);
    setCheckinsOffset(0);
    setAttErr(null);
  }

  async function loadAttendance(reset = true) {
    const eid = eventId.trim();
    if (!eid) {
      setAttErr("Seleziona un evento.");
      return;
    }

    const q = attQDebounced.trim();
    const scope = attTab === "entered" ? "checkins" : "tickets";

    const off =
      scope === "checkins"
        ? reset
          ? 0
          : checkinsOffset
        : reset
        ? 0
        : ticketsOffset;

    setAttLoading(true);
    setAttErr(null);
    if (reset) {
      resetAttendanceStateForNewQuery();
    }

    try {
      let url = `/api/admin/attendance?event_id=${encodeURIComponent(eid)}&limit=${attLimit}&offset=${off}&scope=${scope}`;

      if (scope === "tickets") {
        if (attTab === "missing") url += `&view=missing`;
        else url += `&view=all`;
        if (q) url += `&q=${encodeURIComponent(q)}`;
      } else {
        url += `&kind=${encodeURIComponent(attKind)}`;
        if (q) url += `&q=${encodeURIComponent(q)}`;
      }

      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as AttendanceResp;

      if (!r.ok || !j?.ok) throw new Error((j as any)?.error || "Errore caricamento presenze");

      // ✅ calcolo has_more se il backend non lo manda
      if (j.ok && j.tickets_payload && typeof j.tickets_payload.has_more === "undefined") {
        j.tickets_payload.has_more = (j.tickets_payload.tickets?.length ?? 0) >= attLimit;
      }
      if (j.ok && j.checkins_payload && typeof j.checkins_payload.has_more === "undefined") {
        j.checkins_payload.has_more = (j.checkins_payload.checkins?.length ?? 0) >= attLimit;
      }

      setAttData((prev) => {
        if (reset || !prev || !("ok" in prev) || !prev.ok) return j;

        // append paging in modo safe
        const next = j as any;
        const old = prev as any;

        // tickets append
        if (old.tickets_payload && next.tickets_payload) {
          next.tickets_payload.tickets = [
            ...(old.tickets_payload.tickets || []),
            ...(next.tickets_payload.tickets || []),
          ];
        }

        // checkins append
        if (old.checkins_payload && next.checkins_payload) {
          next.checkins_payload.checkins = [
            ...(old.checkins_payload.checkins || []),
            ...(next.checkins_payload.checkins || []),
          ];
        }

        return next;
      });

      // increment offset basato su quanto è tornato davvero
      if (scope === "checkins") {
        const got = (j as any).checkins_payload?.checkins?.length ?? 0;
        setCheckinsOffset((reset ? 0 : checkinsOffset) + got);
      } else {
        const got = (j as any).tickets_payload?.tickets?.length ?? 0;
        setTicketsOffset((reset ? 0 : ticketsOffset) + got);
      }
    } catch (e: any) {
      setAttErr(e?.message || "Errore");
    } finally {
      setAttLoading(false);
    }
  }

  // reload attendance quando cambia tab / kind / query debounced (se drawer aperto)
  useEffect(() => {
    if (!attOpen) return;
    loadAttendance(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attOpen, attTab, attKind, attQDebounced]);

  const drawerTitle = useMemo(() => {
    if (attTab === "missing") return "Da entrare (ticket)";
    if (attTab === "tickets") return "Biglietti (tutti)";
    return "Entrati (tutti i check-in)";
  }, [attTab]);

  const canLoadMoreTickets = useMemo(() => {
    if (!attData || !("ok" in attData) || !attData.ok) return false;
    return !!attData.tickets_payload?.has_more && !attLoading;
  }, [attData, attLoading]);

  const canLoadMoreCheckins = useMemo(() => {
    if (!attData || !("ok" in attData) || !attData.ok) return false;
    return !!attData.checkins_payload?.has_more && !attLoading;
  }, [attData, attLoading]);

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
              <button
                type="button"
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
                    // reset drawer
                    setAttData(null);
                    setTicketsOffset(0);
                    setCheckinsOffset(0);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/30"
                >
                  {!eventsLoading && events.length === 0 ? <option value="">Nessun evento disponibile</option> : null}
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
                  {eventsErr ? <span className="text-red-300">{eventsErr}</span> : <>UUID usato per il check-in.</>}
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

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!eventId.trim()) {
                      alert("Seleziona un evento.");
                      return;
                    }
                    setAttOpen(true);
                    setAttTab("missing");
                    setAttKind("ALL");
                    setAttQ("");
                    setAttData(null);
                    setTicketsOffset(0);
                    setCheckinsOffset(0);
                  }}
                  disabled={!apiKeyOk || !eventId.trim()}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  📋 Presenze
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
                  <div className="mt-2 text-[11px] text-white/40">iPhone/iPad: serve HTTPS (Vercel).</div>
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
                  type="button"
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

            {/* Risultato check */}
            <section className="mt-4">
              {!res ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                  Nessun controllo ancora.
                </div>
              ) : "ok" in res && res.ok ? (
                (() => {
                  const resAny = res as DoorcheckOkResponse;
                  const allowedNow = !!resAny.allowed;
                  const isDenied = !allowedNow;
                  const denyReasonEff = String(resAny?.reason || denyReason || "").trim();
                  const humanMessage = String(resAny?.message || "").trim();

                  const hasTicketInfo =
                    !!String(resAny?.ticket_offer_title || "").trim() ||
                    !!String(resAny?.ticket_offer_description || "").trim() ||
                    !!String(resAny?.ticket_transaction_id || "").trim() ||
                    !!String(resAny?.ticket_booking_date || "").trim();

                  return (
                    <div
                      className={`rounded-2xl border p-5 ${
                        allowedNow ? "border-emerald-400/30 bg-emerald-400/10" : "border-red-400/30 bg-red-400/10"
                      }`}
                    >
                      <div className="text-lg font-semibold">{allowedNow ? "✅ ACCESSO OK" : "⛔ ACCESSO NEGATO"}</div>

                      {humanMessage ? (
                        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/85">
                          {humanMessage}
                        </div>
                      ) : null}

                      <div className="mt-2 text-sm font-mono">
                        {resAny.kind ? `kind: ${resAny.kind}` : null}
                        {resAny.kind ? " · " : ""}
                        {resAny.status ? `status: ${resAny.status}` : null}
                        {(resAny.reason || denyReason) ? ` · reason: ${String(resAny.reason || denyReason).trim()}` : ""}
                      </div>

                      {resAny.display_name ? <div className="mt-1 text-white/80">name: {resAny.display_name}</div> : null}

                      {hasTicketInfo ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-sm font-semibold">🎫 Ticket info</div>

                          {resAny.ticket_offer_title ? (
                            <div className="mt-2 text-sm text-white/90">
                              <span className="text-white/50">Offer:</span> {resAny.ticket_offer_title}
                            </div>
                          ) : null}

                          {resAny.ticket_offer_description ? (
                            <div className="mt-1 text-xs text-white/70 whitespace-pre-wrap">
                              {resAny.ticket_offer_description}
                            </div>
                          ) : null}

                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-white/50 font-mono">
                            {resAny.ticket_transaction_id ? <div>tx: {resAny.ticket_transaction_id}</div> : null}
                            {resAny.ticket_booking_date ? <div>booking: {String(resAny.ticket_booking_date)}</div> : null}
                          </div>
                        </div>
                      ) : null}

                      {resAny.checkin_id ? (
                        <div className="mt-2 text-[11px] text-white/40 font-mono">checkin_id: {resAny.checkin_id}</div>
                      ) : null}

                      {isDenied && lastDeniedCode ? (
                        <div className="mt-3 text-[11px] text-white/40 font-mono">lastDeniedCode: {lastDeniedCode}</div>
                      ) : null}

                      {isDenied && denyReasonEff === "not_found" ? (
                        <div className="mt-3 text-sm text-white/80">
                          Suggerimento: apri “Presenze” e cerca il nominativo (può essere ticket di un altro evento o non importato).
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

            {/* Drawer Presenze */}
            {attOpen ? (
              <div className="fixed inset-0 z-50">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAttOpen(false);
                  }}
                />
                <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-black border-l border-white/10 p-5 overflow-y-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">📋 Presenze</div>
                      <div className="text-xs text-white/50 mt-1">{drawerTitle} · ricerca nominativi · paginazione</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAttOpen(false);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { k: "missing", label: "Da entrare" },
                      { k: "entered", label: "Entrati" },
                      { k: "tickets", label: "Biglietti" },
                    ].map((t) => (
                      <button
                        type="button"
                        key={t.k}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAttTab(t.k as any);
                          resetAttendanceStateForNewQuery();
                        }}
                        className={`rounded-xl px-3 py-2 text-sm border ${
                          attTab === (t.k as any)
                            ? "border-white/30 bg-white/10 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      value={attQ}
                      onChange={(e) => setAttQ(e.target.value)}
                      placeholder="Cerca nome / email / telefono…"
                      className="md:col-span-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                    />

                    {attTab === "entered" ? (
                      <select
                        value={attKind}
                        onChange={(e) => setAttKind(e.target.value as any)}
                        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                      >
                        <option value="ALL">Tutti</option>
                        <option value="ETS">ETS</option>
                        <option value="SRL">SRL</option>
                        <option value="XCEED">XCEED</option>
                      </select>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/50">
                        filtro kind: solo “Entrati”
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        loadAttendance(true);
                      }}
                      disabled={attLoading}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                    >
                      ↻ Aggiorna
                    </button>

                    <label className="flex items-center gap-2 text-xs text-white/50 select-none">
                      <input type="checkbox" checked={attDebug} onChange={(e) => setAttDebug(e.target.checked)} />
                      debug
                    </label>
                  </div>

                  {"ok" in (attData || {}) && (attData as any)?.ok ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold">{(attData as any).event?.name || "Evento"}</div>
                      <div className="mt-1 text-xs text-white/60 font-mono">
                        starts_at: {fmtTS((attData as any).event?.starts_at)} · require_ticket:{" "}
                        {String((attData as any).event?.require_ticket)} · require_membership:{" "}
                        {String((attData as any).event?.require_membership)}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-xs text-white/60">Tickets</div>
                          <div className="text-lg font-semibold">{(attData as any).summary?.tickets_total ?? 0}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-xs text-white/60">Entrati (ticket)</div>
                          <div className="text-lg font-semibold">{(attData as any).summary?.tickets_checked_in ?? 0}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-xs text-white/60">Da entrare</div>
                          <div className="text-lg font-semibold">{(attData as any).summary?.tickets_missing ?? 0}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {attLoading ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      Caricamento…
                    </div>
                  ) : attErr ? (
                    <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                      {attErr}
                    </div>
                  ) : attData && "ok" in attData && attData.ok ? (
                    <div className="mt-4 space-y-4">
                      {attTab === "entered" ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-sm font-semibold">Entrati (check-in)</div>
                          <div className="mt-2 text-xs text-white/50">
                            Mostro {attData.checkins_payload?.checkins?.length ?? 0}
                          </div>

                          <div className="mt-3 space-y-2">
                            {(attData.checkins_payload?.checkins || []).length === 0 ? (
                              <div className="text-sm text-white/60">Nessun check-in trovato.</div>
                            ) : (
                              (attData.checkins_payload?.checkins || []).map((c) => (
                                <div key={c.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm text-white/90">
                                      {c.display_name || "—"}{" "}
                                      <span className="text-white/50">· {String(c.kind || "—")}</span>
                                    </div>
                                    <div className="text-[11px] text-white/50 font-mono">{fmtTS(c.created_at)}</div>
                                  </div>
                                  <div className="mt-1 text-[11px] text-white/50 font-mono">
                                    {c.email || ""} {c.phone ? ` · ${c.phone}` : ""} {c.method ? ` · ${c.method}` : ""}
                                  </div>
                                  {attDebug && c.scanned_code ? (
                                    <div className="mt-1 text-[11px] text-white/40 font-mono">code: {c.scanned_code}</div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              loadAttendance(false);
                            }}
                            disabled={!canLoadMoreCheckins}
                            className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"
                          >
                            Carica altri
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-sm font-semibold">
                            {attTab === "missing" ? "Da entrare (ticket senza check-in)" : "Biglietti (tutti)"}
                          </div>

                          <div className="mt-2 text-xs text-white/50">
                            Mostro {attData.tickets_payload?.tickets?.length ?? 0} /{" "}
                            {attData.tickets_payload?.tickets_filtered_count ?? 0}
                          </div>

                          <div className="mt-3 space-y-2">
                            {(attData.tickets_payload?.tickets || []).length === 0 ? (
                              <div className="text-sm text-white/60">Nessun ticket trovato.</div>
                            ) : (
                              (attData.tickets_payload?.tickets || []).map((t) => (
                                <div key={t.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm text-white/90">{t.full_name || "—"}</div>
                                    <div className="text-[11px] text-white/50 font-mono">
                                      {t.checkin_id ? "✅ entrato" : "⏳ da entrare"}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-[11px] text-white/50 font-mono">
                                    {t.email || ""} {t.phone ? ` · ${t.phone}` : ""}{" "}
                                    {t.booking_date ? ` · booking: ${String(t.booking_date)}` : ""}
                                  </div>

                                  {t.offer_title ? (
                                    <div className="mt-2 text-xs text-white/80">
                                      <span className="text-white/50">Offer:</span> {t.offer_title}
                                    </div>
                                  ) : null}

                                  {attDebug && (t.transaction_id || t.offer_description) ? (
                                    <div className="mt-2 text-[11px] text-white/50 font-mono">
                                      {t.transaction_id ? `tx: ${t.transaction_id}` : ""}
                                      {t.offer_description ? ` · ${String(t.offer_description).slice(0, 140)}…` : ""}
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              loadAttendance(false);
                            }}
                            disabled={!canLoadMoreTickets}
                            className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"
                          >
                            Carica altri
                          </button>
                        </div>
                      )}

                      {attData.checkins_payload?.last_checkins?.length ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-sm font-semibold">Ultimi check-in (rapidi)</div>
                          <div className="mt-3 space-y-2">
                            {(attData.checkins_payload.last_checkins || []).map((c) => (
                              <div key={c.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-white/90">
                                    {c.display_name || "—"}{" "}
                                    <span className="text-white/50">· {String(c.kind || "—")}</span>
                                  </div>
                                  <div className="text-[11px] text-white/50 font-mono">{fmtTS(c.created_at)}</div>
                                </div>
                                <div className="mt-1 text-[11px] text-white/50 font-mono">
                                  {c.email || ""} {c.phone ? ` · ${c.phone}` : ""} {c.method ? ` · ${c.method}` : ""}
                                </div>
                                {attDebug && c.scanned_code ? (
                                  <div className="mt-1 text-[11px] text-white/40 font-mono">code: {c.scanned_code}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      Nessun dato.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
