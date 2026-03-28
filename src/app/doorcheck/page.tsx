"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

const DOOR_PIN = "1979";
const LS_KEY = "doorcheck_pin_ok";
const LS_KEY_API = "doorcheck_api_key";
const LS_KEY_DEVICE = "doorcheck_device_id";

type DoorUi = {
  type?: "ETS" | "SRL" | "XCEED" | "UNKNOWN";
  color?: "green" | "red" | "blue" | "gold" | "gray";
  badge?: string;
};

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
  ticket_type?: string | null;
  ticket_type_label?: string | null;
  ticket_offer_type_debug?: {
    from_label?: string | null;
    from_type?: string | null;
    raw_offer_type?: string | null;
  } | null;

  member_found?: boolean;
  member_group?: "ordinary" | "loyalty" | "staff" | null;
  member_group_label?: string | null;
  priority_access?: boolean;
  member_active_for_access?: boolean;
  member_access_note?: string | null;
  member_status_raw?: string | null;
  eligible_for_membership_invite?: boolean;
  membership_invite_url?: string | null;

  ui?: DoorUi | null;
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
        checkins_total?: number;
        checkins_allowed?: number;
        checkins_denied?: number;
        checkins_allowed_by_kind?: {
          ETS?: number;
          XCEED?: number;
          SRL?: number;
          UNKNOWN?: number;
        };
      };
      tickets_payload?: {
        view: "missing" | "entered" | "all";
        q: string;
        limit: number;
        offset: number;
        tickets_filtered_count: number;
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
          offer_type?: string | null;
          offer_type_label?: string | null;
          transaction_id: string | null;
          booking_date: string | null;
        }>;
      };
      checkins_payload?: {
        kind: string;
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

type SyncTicketsResp =
  | { ok: false; error: string; details?: string }
  | {
      ok: true;
      xceedStatus?: number;
      xceedEventRef?: string | null;
      xceedTicketsEventId?: string | null;
      localEventId?: string | null;
      localEventName?: string | null;
      fetched_tickets?: number;
      fetched_bookings?: number;
      merged_rows?: number;
      deduped_rows?: number;
      duplicates_removed?: number;
      upserted?: number;
      total_rows_after_sync?: number;
      source?: string | null;
      preview?: Array<{
        id: string;
        qr_code: string;
        status: string;
        full_name: string | null;
        email: string | null;
        booking_date: string | null;
        transaction_id: string | null;
        offer_type: string | null;
        offer_name: string | null;
        source: string | null;
      }>;
      message?: string;
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

function badgeClasses(color?: string, allowed?: boolean) {
  if (!allowed) return "border-red-400/30 bg-red-400/15 text-red-100";
  switch (color) {
    case "gold":
      return "border-amber-400/30 bg-amber-400/15 text-amber-100";
    case "blue":
      return "border-sky-400/30 bg-sky-400/15 text-sky-100";
    case "gray":
      return "border-white/15 bg-white/10 text-white";
    case "green":
    default:
      return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  }
}

function panelClasses(color?: string, allowed?: boolean) {
  if (!allowed) return "border-red-400/30 bg-red-400/10";
  switch (color) {
    case "gold":
      return "border-amber-400/30 bg-amber-400/10";
    case "blue":
      return "border-sky-400/30 bg-sky-400/10";
    case "gray":
      return "border-white/15 bg-white/5";
    case "green":
    default:
      return "border-emerald-400/30 bg-emerald-400/10";
  }
}

function normalizeTicketType(input?: string | null) {
  const t = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (!t) return null;
  if (t === "guestlist" || t === "guest-list") return "guest-list";
  if (t === "ticket") return "ticket";
  return t;
}

function prettifyTicketType(input?: string | null) {
  const t = normalizeTicketType(input);
  if (!t) return null;
  if (t === "guest-list") return "Guest List";
  if (t === "ticket") return "Ticket";

  return t
    .split("-")
    .map((x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : ""))
    .join(" ");
}

function ticketTypeBadgeClasses(ticketType?: string | null) {
  const t = normalizeTicketType(ticketType);

  switch (t) {
    case "guest-list":
      return "border-fuchsia-400/30 bg-fuchsia-400/15 text-fuchsia-100";
    case "ticket":
      return "border-sky-400/30 bg-sky-400/15 text-sky-100";
    case "staff":
      return "border-cyan-400/30 bg-cyan-400/15 text-cyan-100";
    case "table":
      return "border-amber-400/30 bg-amber-400/15 text-amber-100";
    default:
      return "border-white/15 bg-white/10 text-white";
  }
}

function personStatusBadge(res: DoorcheckOkResponse) {
  if (res.member_group === "staff") {
    return {
      label: "STAFF",
      className: "border-cyan-400/30 bg-cyan-400/15 text-cyan-100",
    };
  }

  if (res.member_found) {
    return {
      label: "SOCIO",
      className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-100",
    };
  }

  return {
    label: "NON SOCIO",
    className: "border-rose-400/30 bg-rose-400/15 text-rose-100",
  };
}

function kindBadgeClasses(kind?: string | null) {
  switch (String(kind || "").toUpperCase()) {
    case "ETS":
      return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
    case "XCEED":
      return "border-sky-400/30 bg-sky-400/15 text-sky-100";
    case "SRL":
      return "border-white/15 bg-white/10 text-white";
    default:
      return "border-white/10 bg-black/20 text-white/70";
  }
}

function entryStatusBadgeClasses(entered: boolean) {
  return entered
    ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100"
    : "border-amber-400/30 bg-amber-400/15 text-amber-100";
}

function compactText(v?: string | null) {
  const s = String(v || "").trim();
  return s || null;
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

  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [lastDeniedCode, setLastDeniedCode] = useState<string | null>(null);
  const [inviteQrOpen, setInviteQrOpen] = useState(false);
  const [inviteQrUrl, setInviteQrUrl] = useState("");

  const [attOpen, setAttOpen] = useState(false);
  const [attTab, setAttTab] = useState<"missing" | "entered" | "tickets">("missing");
  const [attQ, setAttQ] = useState("");
  const [attQDebounced, setAttQDebounced] = useState("");
  const [attKind, setAttKind] = useState<"ALL" | "ETS" | "SRL" | "XCEED">("ALL");
  const [attLoading, setAttLoading] = useState(false);
  const [attErr, setAttErr] = useState<string | null>(null);
  const [attData, setAttData] = useState<AttendanceResp | null>(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncRes, setSyncRes] = useState<SyncTicketsResp | null>(null);

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
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overscrollBehavior = prevOverscroll;
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

    try {
      const did = (localStorage.getItem(LS_KEY_DEVICE) || "").trim();
      if (did) setDeviceId(did);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const u = new URL(window.location.href);
    const token = (u.searchParams.get("provision") || "").trim();
    if (!token) return;

    const deviceFromUrl = (u.searchParams.get("device_id") || "").trim();
    const did = deviceFromUrl || deviceId.trim() || null;

    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/doorcheck/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token, device_id: did }),
        });

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          const msg = String(j?.error || "Provision failed");
          alert(`❌ Provisioning non riuscito: ${msg}`);
          return;
        }

        const api_key = String(j.api_key || "").trim();
        if (!api_key) {
          alert("❌ Provisioning: api_key mancante");
          return;
        }

        try {
          localStorage.setItem(LS_KEY_API, api_key);
        } catch {}

        if (cancelled) return;

        setApiKey(api_key);
        setApiKeyOk(true);
        setRes(null);
        setLastDeniedCode(null);

        u.searchParams.delete("provision");
        u.searchParams.delete("device_id");
        window.history.replaceState({}, "", u.pathname + u.search);

        alert("✅ Door API Key installata su questo dispositivo.");
      } catch (e: any) {
        alert(`❌ Provisioning errore rete: ${e?.message || "Errore"}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    return () => stopScanner();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setAttQDebounced(attQ.trim()), 250);
    return () => clearTimeout(t);
  }, [attQ]);

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
  }, [pinOk, selectedEventId]);

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
        body: JSON.stringify({
          event_id: eid,
          qr: code,
          device_id: did || undefined,
        }),
      });

      const data = (await r.json()) as DoorcheckResponse;
      setRes(data);

      if (data && "ok" in data && data.ok && !data.allowed) {
        setLastDeniedCode(code);
      }

      if (data && "ok" in data && data.ok && data.allowed) {
        setQr("");
      }
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

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }

    try {
      video.setAttribute("playsinline", "true");
      (video as any).playsInline = true;
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

      controlsRef.current = await readerRef.current.decodeFromConstraints(
        constraints,
        video,
        (result, err) => {
          if (result) {
            const text = result.getText()?.trim();
            if (!text) return;

            setQr(text);

            if (autoSubmitOnScan && eventId.trim()) {
              stopScanner();
              setTimeout(() => {
                void doCheck(text);
              }, 80);
            }
            return;
          }

          if (err && !isProbablyNotFoundErr(err)) {
            setScanErr(String((err as any)?.message || err));
          }
        }
      );

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
      let url = `/api/admin/attendance?event_id=${encodeURIComponent(
        eid
      )}&limit=${attLimit}&offset=${off}&scope=${scope}`;

      if (scope === "tickets") {
        if (attTab === "missing") {
          url += `&view=missing`;
        } else {
          url += `&view=all`;
        }

        if (q) {
          url += `&q=${encodeURIComponent(q)}`;
        }
      } else {
        url += `&kind=${encodeURIComponent(attKind)}`;
        if (q) {
          url += `&q=${encodeURIComponent(q)}`;
        }
      }

      const r = await fetch(url, { cache: "no-store" });
      const payloadResp = (await r.json()) as AttendanceResp;

      if (!r.ok || !payloadResp?.ok) {
        throw new Error((payloadResp as any)?.error || "Errore caricamento presenze");
      }

      const merged = payloadResp as Extract<AttendanceResp, { ok: true }>;

      if (merged.tickets_payload && typeof merged.tickets_payload.has_more === "undefined") {
        merged.tickets_payload.has_more = (merged.tickets_payload.tickets?.length ?? 0) >= attLimit;
      }

      if (merged.checkins_payload && typeof merged.checkins_payload.has_more === "undefined") {
        merged.checkins_payload.has_more = (merged.checkins_payload.checkins?.length ?? 0) >= attLimit;
      }

      setAttData((prev) => {
        if (reset || !prev || !("ok" in prev) || !prev.ok) {
          return merged;
        }

        const old = prev as any;
        const next = { ...merged } as any;

        if (old.tickets_payload && next.tickets_payload) {
          next.tickets_payload = {
            ...next.tickets_payload,
            tickets: [...(old.tickets_payload.tickets || []), ...(next.tickets_payload.tickets || [])],
          };
        }

        if (old.checkins_payload && next.checkins_payload) {
          next.checkins_payload = {
            ...next.checkins_payload,
            checkins: [...(old.checkins_payload.checkins || []), ...(next.checkins_payload.checkins || [])],
          };
        }

        return next;
      });

      if (scope === "checkins") {
        const got = merged.checkins_payload?.checkins?.length ?? 0;
        setCheckinsOffset((reset ? 0 : checkinsOffset) + got);
      } else {
        const got = merged.tickets_payload?.tickets?.length ?? 0;
        setTicketsOffset((reset ? 0 : ticketsOffset) + got);
      }
    } catch (e: any) {
      setAttErr(e?.message || "Errore");
    } finally {
      setAttLoading(false);
    }
  }

  async function refreshTicketsSync() {
    const eid = eventId.trim();
    if (!eid) {
      alert("Seleziona un evento.");
      return;
    }

    setSyncLoading(true);
    setSyncRes(null);

    try {
      const r = await fetch(
        `/api/xceed/sync-tickets?localEventId=${encodeURIComponent(eid)}&includeCancelledTickets=true`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const j = (await r.json()) as SyncTicketsResp;
      setSyncRes(j);

      if (!r.ok || !("ok" in j) || !j.ok) {
        return;
      }

      setAttData(null);
      setTicketsOffset(0);
      setCheckinsOffset(0);
      setAttErr(null);

      if (attOpen) {
        await loadAttendance(true);
      }

      setRes(null);
      setLastDeniedCode(null);
    } catch (e: any) {
      setSyncRes({
        ok: false,
        error: e?.message || "Errore sync biglietti",
      });
    } finally {
      setSyncLoading(false);
    }
  }

  useEffect(() => {
    if (!attOpen) return;
    void loadAttendance(true);
  }, [attOpen, attTab, attKind, attQDebounced, eventId]);

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

  const summaryBox = useMemo(() => {
    if (!attData || !("ok" in attData) || !attData.ok) return null;

    const summary = attData.summary || {};
    const ticketsPayload = attData.tickets_payload || null;

    const displayedTicketsTotal =
      attTab === "tickets"
        ? ticketsPayload?.tickets_filtered_count ?? summary.tickets_total ?? 0
        : attTab === "missing"
          ? (ticketsPayload?.tickets_filtered_count ?? 0) + (summary.tickets_checked_in ?? 0)
          : summary.tickets_total ?? 0;

    const displayedMissingTotal =
      attTab === "missing"
        ? ticketsPayload?.tickets_filtered_count ?? summary.tickets_missing ?? 0
        : summary.tickets_missing ?? 0;

    return {
      displayedTicketsTotal,
      displayedMissingTotal,
    };
  }, [attData, attTab]);
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
                    setAttData(null);
                    setTicketsOffset(0);
                    setCheckinsOffset(0);
                    setAttErr(null);
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
                    onChange={(e) => {
                      const v = e.target.value;
                      setDeviceId(v);
                      try {
                        localStorage.setItem(LS_KEY_DEVICE, v.trim());
                      } catch {}
                    }}
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
                  onClick={refreshTicketsSync}
                  disabled={syncLoading || !eventId.trim()}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  {syncLoading ? "↻ Sync in corso..." : "↻ Refresh biglietti"}
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
                    setAttErr(null);
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

              {syncRes ? (
                "ok" in syncRes && syncRes.ok ? (
                  <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <div className="text-sm font-semibold text-emerald-100">Sync biglietti completata</div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px] text-emerald-50/90 font-mono">
                      <div>event: {syncRes.localEventName || syncRes.localEventId || "-"}</div>
                      <div>xceed status: {String(syncRes.xceedStatus ?? "-")}</div>
                      <div>tickets: {String(syncRes.fetched_tickets ?? 0)}</div>
                      <div>bookings: {String(syncRes.fetched_bookings ?? 0)}</div>
                      <div>merged rows: {String(syncRes.merged_rows ?? 0)}</div>
                      <div>deduped rows: {String(syncRes.deduped_rows ?? 0)}</div>
                      <div>duplicates removed: {String(syncRes.duplicates_removed ?? 0)}</div>
                      <div>upserted: {String(syncRes.upserted ?? 0)}</div>
                      <div>total after sync: {String(syncRes.total_rows_after_sync ?? 0)}</div>
                    </div>

                    {syncRes.preview?.length ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-semibold text-white/80">Preview</div>
                        <div className="mt-2 space-y-2">
                          {syncRes.preview.slice(0, 3).map((p) => (
                            <div key={p.id} className="text-[11px] text-white/70 font-mono break-all">
                              {p.full_name || "—"} · {p.qr_code} · {p.offer_type || "-"} · {p.offer_name || "-"}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
                    <div className="text-sm font-semibold text-red-100">Errore sync biglietti</div>
                    <div className="mt-2 text-[12px] text-red-50/90 font-mono break-all">
                      {(syncRes as any).error || "Errore"}
                    </div>
                    {(syncRes as any).details ? (
                      <div className="mt-1 text-[11px] text-red-100/70 font-mono break-all">
                        {(syncRes as any).details}
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}

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
                    if (e.key === "Enter") {
                      void doCheck();
                    }
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
                  onClick={() => {
                    void doCheck();
                  }}
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
                    setInviteQrOpen(false);
                    setInviteQrUrl("");
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
                    <span className="text-[11px] text-white/40 font-mono">
                      scanned_code: {lastDeniedCode || "(n/a)"}
                    </span>
                  </div>
                </div>
              )}

              {manualOpen ? (
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
                      onClick={() => {
                        void doManualCheck();
                      }}
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
              ) : null}
            </section>

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
                  const denyReasonEff = String(resAny.reason || denyReason || "").trim();
                  const humanMessage = String(resAny.message || "").trim();
                  const ui = resAny.ui || null;
                  const memberLabel = String(resAny.member_group_label || "").trim();
                  const memberStatus = String(resAny.member_status_raw || "").trim();
                  const inviteUrl = String(resAny.membership_invite_url || "").trim();

                  const ticketTypeNorm = normalizeTicketType(resAny.ticket_type);
                  const ticketTypeLabel =
                    truthy(resAny.ticket_type_label || "") || prettifyTicketType(resAny.ticket_type);
                  const personBadge = personStatusBadge(resAny);

                  const hasTicketInfo =
                    !!String(resAny.ticket_offer_title || "").trim() ||
                    !!String(resAny.ticket_offer_description || "").trim() ||
                    !!String(resAny.ticket_transaction_id || "").trim() ||
                    !!String(resAny.ticket_booking_date || "").trim() ||
                    !!String(resAny.ticket_type || "").trim() ||
                    !!String(resAny.ticket_type_label || "").trim();

                  const hasMemberInfo =
                    !!resAny.member_found ||
                    !!memberLabel ||
                    !!memberStatus ||
                    !!resAny.member_access_note ||
                    !!resAny.priority_access ||
                    resAny.member_group === "staff";

                  return (
                    <div className={`rounded-2xl border p-5 ${panelClasses(ui?.color, allowedNow)}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold">{allowedNow ? "✅ ACCESSO OK" : "⛔ ACCESSO NEGATO"}</div>

                        {resAny.kind ? (
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                            {resAny.kind}
                          </span>
                        ) : null}

                        {ticketTypeLabel ? (
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${ticketTypeBadgeClasses(
                              ticketTypeNorm
                            )}`}
                          >
                            {String(ticketTypeLabel).toUpperCase()}
                          </span>
                        ) : null}

                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${personBadge.className}`}>
                          {personBadge.label}
                        </span>
                      </div>

                      {humanMessage ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/85">
                          {humanMessage}
                        </div>
                      ) : null}

                      {resAny.display_name ? (
                        <div className="mt-3 text-xl font-semibold text-white">{resAny.display_name}</div>
                      ) : null}

                      <div className="mt-2 text-sm font-mono text-white/70">
                        {resAny.status ? `status: ${resAny.status}` : null}
                        {(resAny.reason || denyReason) ? ` · reason: ${String(resAny.reason || denyReason).trim()}` : ""}
                      </div>

                      {hasMemberInfo ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-sm font-semibold">👤 Membership</div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${personBadge.className}`}>
                              {personBadge.label}
                            </span>

                            {memberLabel ? (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses(
                                  ui?.color,
                                  !!resAny.member_found || allowedNow
                                )}`}
                              >
                                {memberLabel}
                              </span>
                            ) : null}

                            {resAny.priority_access ? (
                              <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-100">
                                Priority access
                              </span>
                            ) : null}

                            {memberStatus ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                                Stato: {memberStatus}
                              </span>
                            ) : null}
                          </div>

                          {resAny.member_access_note ? (
                            <div className="mt-2 text-xs text-white/70">{resAny.member_access_note}</div>
                          ) : null}
                        </div>
                      ) : null}

                      {hasTicketInfo ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-sm font-semibold">🎫 Ticket</div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {ticketTypeLabel ? (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${ticketTypeBadgeClasses(
                                  ticketTypeNorm
                                )}`}
                              >
                                {ticketTypeLabel}
                              </span>
                            ) : null}

                            {resAny.ticket_offer_title ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                                {resAny.ticket_offer_title}
                              </span>
                            ) : null}
                          </div>

                          {resAny.ticket_offer_title ? (
                            <div className="mt-3 text-sm text-white/90">
                              <span className="text-white/50">Offer:</span> {resAny.ticket_offer_title}
                            </div>
                          ) : null}

                          {resAny.ticket_offer_description ? (
                            <div className="mt-1 text-xs text-white/70 whitespace-pre-wrap">
                              {resAny.ticket_offer_description}
                            </div>
                          ) : null}

                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-white/50 font-mono">
                            {ticketTypeLabel ? (
                              <div>
                                type label: <span className="text-white/80">{ticketTypeLabel}</span>
                              </div>
                            ) : null}

                            {resAny.ticket_type ? (
                              <div>
                                raw type: <span className="text-white/80">{resAny.ticket_type}</span>
                              </div>
                            ) : null}

                            {resAny.ticket_offer_type_debug?.raw_offer_type ? (
                              <div>
                                raw offer.type:{" "}
                                <span className="text-white/80">{resAny.ticket_offer_type_debug.raw_offer_type}</span>
                              </div>
                            ) : null}

                            {resAny.ticket_transaction_id ? <div>tx: {resAny.ticket_transaction_id}</div> : null}

                            {resAny.ticket_booking_date ? <div>booking: {String(resAny.ticket_booking_date)}</div> : null}
                          </div>
                        </div>
                      ) : null}

                      {!allowedNow && inviteUrl ? (
                        <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
                          <div className="text-sm font-semibold text-sky-100">🪪 Non socio</div>
                          <div className="mt-1 text-xs text-sky-50/80">
                            Ticket trovato, ma membership non presente o richiesta per l’accesso.
                          </div>

                          <div className="mt-3 flex flex-wrap gap-3">
                            <a
                              href={inviteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
                            >
                              Apri iscrizione Wally
                            </a>

                            <button
                              type="button"
                              onClick={() => {
                                setInviteQrUrl(inviteUrl);
                                setInviteQrOpen(true);
                              }}
                              className="inline-flex rounded-xl border border-white/20 bg-black/20 px-4 py-2 text-sm font-semibold text-white hover:bg-black/30"
                            >
                              Mostra QR iscrizione
                            </button>
                          </div>

                          <div className="mt-3 text-[11px] text-sky-50/60 break-all">{inviteUrl}</div>
                        </div>
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
                        void loadAttendance(true);
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

                  {"ok" in (attData || {}) && (attData as any)?.ok && summaryBox ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold">{(attData as any).event?.name || "Evento"}</div>

                      <div className="mt-1 text-xs text-white/60 font-mono">
                        starts_at: {fmtTS((attData as any).event?.starts_at)} · require_ticket:{" "}
                        {String((attData as any).event?.require_ticket)} · require_membership:{" "}
                        {String((attData as any).event?.require_membership)}
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3">
                          <div className="text-xs text-sky-100/70">Biglietti totali</div>
                          <div className="text-2xl font-semibold text-sky-100">{summaryBox.displayedTicketsTotal}</div>
                        </div>

                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                          <div className="text-xs text-amber-100/70">Da entrare</div>
                          <div className="text-2xl font-semibold text-amber-100">{summaryBox.displayedMissingTotal}</div>
                        </div>

                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                          <div className="text-xs text-emerald-100/70">Entrati (totali)</div>
                          <div className="text-2xl font-semibold text-emerald-100">
                            {(attData as any).summary?.checkins_allowed ?? 0}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-xs text-white/60">ETS</div>
                          <div className="text-lg font-semibold">
                            {(attData as any).summary?.checkins_allowed_by_kind?.ETS ?? 0}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-xs text-white/60">XCEED</div>
                          <div className="text-lg font-semibold">
                            {(attData as any).summary?.checkins_allowed_by_kind?.XCEED ?? 0}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-xs text-white/60">SRL</div>
                          <div className="text-lg font-semibold">
                            {(attData as any).summary?.checkins_allowed_by_kind?.SRL ?? 0}
                          </div>
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
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold text-white/95 break-words">
                                        {c.display_name || "—"}
                                      </div>

                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <span
                                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${kindBadgeClasses(
                                            c.kind
                                          )}`}
                                        >
                                          {String(c.kind || "UNKNOWN").toUpperCase()}
                                        </span>

                                        <span
                                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${entryStatusBadgeClasses(
                                            true
                                          )}`}
                                        >
                                          ENTRATO
                                        </span>

                                        {c.result ? (
                                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80">
                                            {String(c.result)}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="text-[11px] text-white/50 font-mono whitespace-nowrap">
                                      {fmtTS(c.created_at)}
                                    </div>
                                  </div>

                                  {(compactText(c.email) || compactText(c.phone) || compactText(c.method)) ? (
                                    <div className="mt-2 text-[11px] text-white/50 font-mono break-words">
                                      {compactText(c.email) || ""}
                                      {compactText(c.phone) ? ` · ${c.phone}` : ""}
                                      {compactText(c.method) ? ` · ${c.method}` : ""}
                                    </div>
                                  ) : null}

                                  {attDebug && c.scanned_code ? (
                                    <div className="mt-1 text-[11px] text-white/40 font-mono break-all">
                                      code: {c.scanned_code}
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
                              void loadAttendance(false);
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
                              (attData.tickets_payload?.tickets || []).map((t) => {
                                const entered = !!t.checkin_id;
                                const offerTypeNorm = normalizeTicketType(t.offer_type || null);
                                const offerTypeLabel =
                                  truthy(t.offer_type_label || "") || prettifyTicketType(t.offer_type || null);

                                return (
                                  <div key={t.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-white/95 break-words">
                                          {t.full_name || "—"}
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                          <span
                                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${entryStatusBadgeClasses(
                                              entered
                                            )}`}
                                          >
                                            {entered ? "ENTRATO" : "DA ENTRARE"}
                                          </span>

                                          {offerTypeLabel ? (
                                            <span
                                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${ticketTypeBadgeClasses(
                                                offerTypeNorm
                                              )}`}
                                            >
                                              {offerTypeLabel.toUpperCase()}
                                            </span>
                                          ) : null}

                                          {t.offer_title ? (
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80">
                                              {t.offer_title}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="text-[11px] text-white/50 font-mono whitespace-nowrap">
                                        {entered ? "✅ check-in" : "⏳ pending"}
                                      </div>
                                    </div>

                                    {(compactText(t.email) || compactText(t.phone) || compactText(t.booking_date)) ? (
                                      <div className="mt-2 text-[11px] text-white/50 font-mono break-words">
                                        {compactText(t.email) || ""}
                                        {compactText(t.phone) ? ` · ${t.phone}` : ""}
                                        {compactText(t.booking_date) ? ` · booking: ${String(t.booking_date)}` : ""}
                                      </div>
                                    ) : null}

                                    {t.offer_title ? (
                                      <div className="mt-2 text-xs text-white/85">
                                        <span className="text-white/50">Offer:</span> {t.offer_title}
                                      </div>
                                    ) : null}

                                    {t.offer_description ? (
                                      <div className="mt-1 text-[11px] text-white/60 whitespace-pre-wrap">
                                        {String(t.offer_description)}
                                      </div>
                                    ) : null}

                                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-white/45 font-mono">
                                      {offerTypeLabel ? (
                                        <div>
                                          type label: <span className="text-white/80">{offerTypeLabel}</span>
                                        </div>
                                      ) : null}

                                      {t.offer_type ? (
                                        <div>
                                          raw type: <span className="text-white/80">{t.offer_type}</span>
                                        </div>
                                      ) : null}

                                      {t.transaction_id ? <div>tx: {t.transaction_id}</div> : null}

                                      {t.imported_at ? <div>imported: {fmtTS(t.imported_at)}</div> : null}
                                    </div>

                                    {attDebug && t.checkin_id ? (
                                      <div className="mt-2 text-[11px] text-white/35 font-mono break-all">
                                        checkin_id: {t.checkin_id}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void loadAttendance(false);
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
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-white/95 break-words">
                                      {c.display_name || "—"}
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span
                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${kindBadgeClasses(
                                          c.kind
                                        )}`}
                                      >
                                        {String(c.kind || "UNKNOWN").toUpperCase()}
                                      </span>

                                      <span
                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${entryStatusBadgeClasses(
                                          true
                                        )}`}
                                      >
                                        ENTRATO
                                      </span>
                                    </div>
                                  </div>

                                  <div className="text-[11px] text-white/50 font-mono whitespace-nowrap">
                                    {fmtTS(c.created_at)}
                                  </div>
                                </div>

                                {(compactText(c.email) || compactText(c.phone) || compactText(c.method)) ? (
                                  <div className="mt-2 text-[11px] text-white/50 font-mono break-words">
                                    {compactText(c.email) || ""}
                                    {compactText(c.phone) ? ` · ${c.phone}` : ""}
                                    {compactText(c.method) ? ` · ${c.method}` : ""}
                                  </div>
                                ) : null}

                                {attDebug && c.scanned_code ? (
                                  <div className="mt-1 text-[11px] text-white/40 font-mono break-all">
                                    code: {c.scanned_code}
                                  </div>
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

            {inviteQrOpen ? (
              <div className="fixed inset-0 z-[60]">
                <div
                  className="absolute inset-0 bg-black/70"
                  onClick={() => {
                    setInviteQrOpen(false);
                  }}
                />
                <div className="absolute inset-x-0 top-1/2 mx-auto w-[92%] max-w-md -translate-y-1/2 rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">Iscrizione socio</div>
                      <div className="mt-1 text-xs text-white/50">Fai inquadrare questo QR al cliente</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInviteQrOpen(false)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-5 flex justify-center">
                    <div className="rounded-2xl bg-white p-4">
                      <QRCode
                        value={inviteQrUrl || "https://www.wallyfor.com"}
                        size={220}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                      />
                    </div>
                  </div>

                  <div className="mt-4 text-center text-xs text-white/60 break-all">{inviteQrUrl}</div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <a
                      href={inviteQrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex justify-center rounded-xl bg-white text-black px-4 py-3 text-sm font-semibold"
                    >
                      Apri iscrizione
                    </a>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteQrUrl);
                          alert("Link copiato");
                        } catch {
                          alert("Impossibile copiare il link");
                        }
                      }}
                      className="inline-flex justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      Copia link
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}