"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from "@zxing/browser";
import QRCode from "react-qr-code";

type DoorResult =
  | "ERROR"
  | "DENY_WALLY"
  | "DENY_RENEWAL"
  | "ALREADY_CHECKED_IN"
  | "OK_MEMBER"
  | "OK_PRIORITY"
  | "OK_PRIVILEGED";

type DoorLiveEventRow = {
  id: string;
  event_id: string;
  gate_id: string;
  live_key: string;
  ticket_id: string | null;
  ticket_qr_code: string | null;
  payload_json: DoorApiResponse | null;
  created_at: string;
};

type DoorApiResponse = {
  anomaly?: {
    kind: "WRONG_GATE";
    expected_role: "ordinary" | "loyalty" | "privileged" | null;
    current_role: "ordinary" | "loyalty" | "privileged" | null;
    scanned_by_role: "ordinary" | "loyalty" | null;
    checked_in_by: string | null;
  } | null;
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
    checkedInBy?: string | null;
  };
  gate_id?: string | null;

  error?: string;
  live_key?: string | null;
};

type MemberSearchRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  membership_group: string | null;
  status: string | null;
  membership_expires_at: string | null;

  already_entered?: boolean;
  entered_at?: string | null;
  entered_gate?: string | null;
  entered_by?: string | null;
  entered_match?: "phone" | "email" | "manual_link" | null;
  entered_qr?: string | null;
  entered_result?: string | null;
  entered_ticket_name?: string | null;
  entered_offer_name?: string | null;
  entered_offer_type?: string | null;
};


type UiTheme = {
  shell: string;
  card: string;
  border: string;
  glow: string;
  badge: string;
  title: string;
  accent: string;
  spotlight: string;
};

function getTheme(result?: DoorResult): UiTheme {
  switch (result) {
    case "OK_MEMBER":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_rgba(27,33,54,0.72),_rgba(7,10,21,1)_70%)]",
        card: "bg-emerald-500/12",
        border: "border-emerald-300/30",
        glow: "shadow-[0_0_60px_rgba(16,185,129,0.18)]",
        badge: "bg-emerald-300 text-black",
        title: "text-emerald-200",
        accent: "text-emerald-100",
        spotlight: "from-emerald-400/20 via-transparent to-transparent",
      };
    case "OK_PRIORITY":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.22),_rgba(120,43,157,0.28),_rgba(7,10,21,1)_72%)]",
        card: "bg-yellow-400/12",
        border: "border-yellow-300/30",
        glow: "shadow-[0_0_70px_rgba(245,158,11,0.18)]",
        badge: "bg-yellow-300 text-black",
        title: "text-yellow-100",
        accent: "text-fuchsia-100",
        spotlight: "from-yellow-300/20 via-fuchsia-400/10 to-transparent",
      };
    case "OK_PRIVILEGED":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_rgba(35,65,140,0.20),_rgba(7,10,21,1)_70%)]",
        card: "bg-blue-500/12",
        border: "border-blue-300/30",
        glow: "shadow-[0_0_65px_rgba(59,130,246,0.18)]",
        badge: "bg-blue-300 text-black",
        title: "text-blue-100",
        accent: "text-sky-100",
        spotlight: "from-blue-300/20 via-cyan-300/10 to-transparent",
      };
    case "ALREADY_CHECKED_IN":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_rgba(69,44,12,0.20),_rgba(7,10,21,1)_72%)]",
        card: "bg-amber-500/12",
        border: "border-amber-300/30",
        glow: "shadow-[0_0_65px_rgba(251,191,36,0.15)]",
        badge: "bg-amber-300 text-black",
        title: "text-amber-100",
        accent: "text-amber-50",
        spotlight: "from-amber-300/20 via-orange-300/10 to-transparent",
      };
    case "DENY_RENEWAL":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.20),_rgba(95,41,18,0.20),_rgba(7,10,21,1)_72%)]",
        card: "bg-orange-500/12",
        border: "border-orange-300/30",
        glow: "shadow-[0_0_65px_rgba(249,115,22,0.16)]",
        badge: "bg-orange-300 text-black",
        title: "text-orange-100",
        accent: "text-orange-50",
        spotlight: "from-orange-300/20 via-red-300/10 to-transparent",
      };
    case "DENY_WALLY":
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.20),_rgba(88,23,46,0.18),_rgba(7,10,21,1)_72%)]",
        card: "bg-rose-500/12",
        border: "border-rose-300/30",
        glow: "shadow-[0_0_70px_rgba(244,63,94,0.17)]",
        badge: "bg-rose-300 text-black",
        title: "text-rose-100",
        accent: "text-rose-50",
        spotlight: "from-rose-300/20 via-fuchsia-300/10 to-transparent",
      };
    case "ERROR":
    default:
      return {
        shell:
          "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.14),_rgba(36,26,72,0.24),_rgba(7,10,21,1)_74%)]",
        card: "bg-white/7",
        border: "border-white/12",
        glow: "shadow-[0_0_50px_rgba(168,85,247,0.10)]",
        badge: "bg-slate-200 text-black",
        title: "text-white",
        accent: "text-slate-200",
        spotlight: "from-fuchsia-300/10 via-violet-300/10 to-transparent",
      };
  }
}

function row(label: string, value?: React.ReactNode) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/8 py-1.5 last:border-b-0">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-[11px] text-white break-all">{value || "—"}</div>
    </div>
  );
}

function playDoorToneWithContext(ctx: AudioContext, kind?: DoorResult) {
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type =
      kind === "DENY_WALLY" || kind === "DENY_RENEWAL" || kind === "ERROR"
        ? "sawtooth"
        : "sine";

    const freq =
      kind === "OK_PRIORITY"
        ? 880
        : kind === "OK_PRIVILEGED"
        ? 740
        : kind === "OK_MEMBER"
        ? 660
        : kind === "ALREADY_CHECKED_IN"
        ? 420
        : 300;

    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    //
  }
}

function getDoorRoleAppearance(role?: string | null) {
  if (role === "loyalty") {
    return {
      label: "LOYALTY",
      title: "PRIORITY ACCESS",
      subtitle: "Fast lane / Loyalty",
      panel:
        "border-violet-300/30 bg-[linear-gradient(135deg,rgba(76,29,149,0.34),rgba(45,17,88,0.22))]",
      chip: "border-violet-300/30 bg-violet-400/15 text-violet-100",
      soft: "text-violet-100",
      subtle: "text-violet-200/75",
      button:
        "border-violet-300/25 bg-violet-400/10 text-violet-50 hover:bg-violet-400/15",
    };
  }

  if (role === "privileged") {
    return {
      label: "STAFF",
      title: "STAFF / PRIVILEGED",
      subtitle: "Guest / Staff / Special access",
      panel:
        "border-sky-300/30 bg-[linear-gradient(135deg,rgba(8,47,73,0.34),rgba(15,23,42,0.22))]",
      chip: "border-sky-300/30 bg-sky-400/15 text-sky-100",
      soft: "text-sky-100",
      subtle: "text-sky-200/75",
      button:
        "border-sky-300/25 bg-sky-400/10 text-sky-50 hover:bg-sky-400/15",
    };
  }

  return {
    label: "STANDARD",
    title: "INGRESSO STANDARD",
    subtitle: "Soci ordinari / Nuovi ingressi",
    panel:
      "border-emerald-300/30 bg-[linear-gradient(135deg,rgba(6,78,59,0.34),rgba(15,23,42,0.20))]",
    chip: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
    soft: "text-emerald-100",
    subtle: "text-emerald-200/75",
    button:
      "border-emerald-300/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15",
  };
}




// QUI INSERIRE I GATE E I RUOLI INSERISCI QUI


type GateEmailConfig = {
  gate_id: string;
  door_role: "ordinary" | "loyalty";
};

const GATE_EMAIL_MAP: Record<string, GateEmailConfig> = {
  "ledvelvetstaff@gmail.com": {
    gate_id: "gate_1",
    door_role: "ordinary",
  },
  "annafilippi003@gmail.com": {
    gate_id: "gate_2",
    door_role: "ordinary",
  },
  "giulianassi00@gmail.com": {
    gate_id: "gate_3",
    door_role: "ordinary",
  },
  "eleonorabuti2@gmail.com": {
    gate_id: "gate_4",
    door_role: "loyalty",
  },
  "shorttermrentaleasy@gmail.com": {
    gate_id: "gate_5",
    door_role: "loyalty",
  },
};

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function getGateConfigFromCheckedBy(value?: string | null): GateEmailConfig | null {
  const email = normalizeEmail(value);
  return GATE_EMAIL_MAP[email] || null;
}

function getGateRoleFromCheckedBy(
  value?: string | null
): "ordinary" | "loyalty" | null {
  return getGateConfigFromCheckedBy(value)?.door_role || null;
}

function getGateIdFromCheckedBy(value?: string | null): string | null {
  return getGateConfigFromCheckedBy(value)?.gate_id || null;
}

function getAssignedEmailFromGateId(gateId?: string | null): string | null {
  if (!gateId) return null;

  const found = Object.entries(GATE_EMAIL_MAP).find(
    ([, config]) => config.gate_id === gateId
  );

  return found?.[0] || null;
}



export default function DoorPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastSoundKeyRef = useRef<string>("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const selectedEventIdRef = useRef("");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [deviceContext, setDeviceContext] = useState<{
    gateId: string | null;
    doorRole: string | null;
    deviceLabel: string | null;
  }>({
    gateId: null,
    doorRole: null,
    deviceLabel: null,
  });

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);

type EventTypeSummaryItem = {
  total: number;
  in: number;
  out: number;
};

const [eventSummary, setEventSummary] = useState<{
  total_tickets: number;
  entered_tickets: number;
  missing_tickets: number;
  ticket_count: number;
  drink_count: number;
  guest_count: number;
  table_count: number;
  cancelled_count: number;
  type_summary: {
    ticket: EventTypeSummaryItem;
    guest: EventTypeSummaryItem;
    table: EventTypeSummaryItem;
    drink: EventTypeSummaryItem;
    cancelled: EventTypeSummaryItem;
    unknown: EventTypeSummaryItem;
  };
} | null>(null);



  const [loadingSummary, setLoadingSummary] = useState(false);

  const [lastLiveTicketKey, setLastLiveTicketKey] = useState("");
  const [manualQr, setManualQr] = useState("");
  const [lastQr, setLastQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [response, setResponse] = useState<DoorApiResponse | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [manualWallyOpen, setManualWallyOpen] = useState(false);

  const [openMemberSearch, setOpenMemberSearch] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchRow[]>([]);
  const [memberSearchError, setMemberSearchError] = useState<string | null>(null);
  const [manualLinkSaving, setManualLinkSaving] = useState(false);
  const [manualLinkMessage, setManualLinkMessage] = useState<string | null>(null);
  const [manualLinkType, setManualLinkType] = useState<"created" | "updated" | "unchanged" | null>(null);

  const theme = useMemo(() => getTheme(response?.result), [response?.result]);
  const roleAppearance = useMemo(
    () => getDoorRoleAppearance(deviceContext.doorRole),
    [deviceContext.doorRole]
  );

const assignedGateEmail = useMemo(
  () => getAssignedEmailFromGateId(deviceContext.gateId),
  [deviceContext.gateId]
);

  const envManualWallyUrl = (process.env.NEXT_PUBLIC_WALLY_MEMBERSHIP_URL || "").trim();

  const wallyActionUrl = useMemo(() => {
    const automatic =
      response?.action === "OPEN_WALLY" ? response?.action_url?.trim() || "" : "";
    return automatic || envManualWallyUrl || "";
  }, [response?.action, response?.action_url, envManualWallyUrl]);

  const bookingSummary = useMemo(() => {
    const booking = response?.booking;
    if (!booking) return null;

    const ticketCount = Number(booking.ticket_count || 0);
    const checkedInCount = Number(booking.checked_in_count || 0);
    const progressLabel = booking.progress_label || `${checkedInCount} / ${ticketCount}`;

    return {
      ticketCount,
      checkedInCount,
      progressLabel,
    };
  }, [response?.booking]);

  const isNonMemberCase = useMemo(() => {
    if (!response) return false;
    if (response.result === "DENY_WALLY") return true;
    if (response.result === "ALREADY_CHECKED_IN" && !response.member) return true;
    return false;
  }, [response]);

  const personName =
    response?.person?.full_name ||
    response?.ticket?.full_name ||
    "—";

  const personEmail =
    response?.person?.email ||
    response?.ticket?.email ||
    response?.ticket?.buyer_email ||
    "—";

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const uiStatus = useMemo(() => {
    const result = response?.result;
    const memberRole = response?.member?.door_role;

  if (response?.anomaly?.kind === "WRONG_GATE") {
    return {
      label: "ANOMALIA PORTA",
      className: "bg-orange-300 text-black",
    };
  }



    if (result === "DENY_WALLY") {
      return {
        label: "NON SOCIO",
        className: "bg-rose-300 text-black",
      };
    }

    if (result === "DENY_RENEWAL") {
      return {
        label: "RINNOVO",
        className: "bg-orange-300 text-black",
      };
    }

    if (result === "OK_PRIORITY") {
      return {
        label: "PRIORITY",
        className: "bg-yellow-300 text-black",
      };
    }

    if (result === "OK_PRIVILEGED") {
      return {
        label: "PRIVILEGED",
        className: "bg-blue-300 text-black",
      };
    }

    if (result === "OK_MEMBER") {
      return {
        label: "ACCESSO OK",
        className: "bg-emerald-300 text-black",
      };
    }

    if (result === "ALREADY_CHECKED_IN" && memberRole === "loyalty") {
      return {
        label: "PRIORITY",
        className: "bg-yellow-300 text-black",
      };
    }

    if (result === "ALREADY_CHECKED_IN" && memberRole === "ordinary") {
      return {
        label: "ACCESSO OK",
        className: "bg-emerald-300 text-black",
      };
    }

    if (result === "ALREADY_CHECKED_IN" && !memberRole) {
      return {
        label: "NON SOCIO",
        className: "bg-rose-300 text-black",
      };
    }

    if (result === "ERROR") {
      return {
        label: "ERRORE",
        className: "bg-slate-200 text-black",
      };
    }

    return {
      label: "DOOR",
      className: "bg-slate-200 text-black",
    };
  }, [response?.result, response?.member?.door_role]);

  const copyToClipboard = useCallback(async (value: string) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage("Link copiato");
      window.setTimeout(() => setCopyMessage(null), 2200);
    } catch {
      setCopyMessage("Copia non riuscita");
      window.setTimeout(() => setCopyMessage(null), 2200);
    }
  }, []);

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

  const loadEventSummary = useCallback(async (eventId: string) => {
    const id = eventId.trim();
    if (!id) {
      setEventSummary(null);
      return;
    }

    try {
      setLoadingSummary(true);

const res = await fetch(
  `/api/door/event-summary?eventId=${encodeURIComponent(id)}&debug=1&t=${Date.now()}`,
  {
    method: "GET",
    cache: "no-store",
  }
);
      const json = await res.json();


console.log("EVENT SUMMARY RESPONSE", {
  requested_id: id,
  selected_ref: selectedEventIdRef.current,
  json,
});




      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Errore caricamento contatore evento");
      }

      if (selectedEventIdRef.current !== id) return;


const emptyType = { total: 0, in: 0, out: 0 };

setEventSummary({
  total_tickets: Number(json.total_tickets || 0),
  entered_tickets: Number(json.entered_tickets || 0),
  missing_tickets: Number(json.missing_tickets || 0),
  ticket_count: Number(json.ticket_count || 0),
  drink_count: Number(json.drink_count || 0),
  guest_count: Number(json.guest_count || 0),
  table_count: Number(json.table_count || 0),
  cancelled_count: Number(json.cancelled_count || 0),
  type_summary: {
    ticket: json.type_summary?.ticket || emptyType,
    guest: json.type_summary?.guest || emptyType,
    table: json.type_summary?.table || emptyType,
    drink: json.type_summary?.drink || emptyType,
    cancelled: json.type_summary?.cancelled || emptyType,
    unknown: json.type_summary?.unknown || emptyType,
  },
});


    } catch (error) {
      console.error("Errore loadEventSummary", error);
      if (selectedEventIdRef.current === id) {
        setEventSummary(null);
      }
    } finally {
      if (selectedEventIdRef.current === id) {
        setLoadingSummary(false);
      }
    }
  }, []);

  const registerNonMemberAttempt = useCallback(async (result: DoorApiResponse | null) => {
    if (!result) return;

    const shouldTrack =
      result.result === "DENY_WALLY" ||
      (result.result === "ALREADY_CHECKED_IN" && !result.member);

    if (!shouldTrack) return;

    const event_id = result.event?.id?.trim();
    const ticket_qr_code = result.ticket?.qr_code?.trim();

    if (!event_id || !ticket_qr_code) return;

    try {
      await fetch("/api/door/non-member-attempt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id,
          ticket_qr_code,
          booking_id: result.ticket?.booking_id ?? null,
          transaction_id: result.ticket?.transaction_id ?? null,
          full_name:
            result.person?.full_name ??
            result.ticket?.full_name ??
            null,
          email:
            result.person?.email ??
            result.ticket?.email ??
            result.ticket?.buyer_email ??
            null,
          phone:
            result.person?.phone ??
            result.ticket?.phone ??
            null,
        }),
      });
    } catch (error) {
      console.error("registerNonMemberAttempt error", error);
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
      setCopyMessage(null);

      try {
        const evalUrl = new URL(
          "/api/door/xceed-live-evaluate",
          window.location.origin
        );

        if (deviceContext.gateId) {
          evalUrl.searchParams.set("gate_id", deviceContext.gateId);
        }

        if (deviceContext.doorRole) {
          evalUrl.searchParams.set("door_role", deviceContext.doorRole);
        }

        if (deviceContext.deviceLabel) {
          evalUrl.searchParams.set("device_label", deviceContext.deviceLabel);
        }

        const effectiveEventId = selectedEventId || "";

        const res = await fetch(evalUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            qrCode: value,
            eventId: effectiveEventId,
          }),
        });

const json = (await res.json()) as DoorApiResponse;

const result = json?.result;
const memberRole = json?.member?.door_role || null;
const doorRole =
  deviceContext.doorRole === "ordinary" ||
  deviceContext.doorRole === "loyalty" ||
  deviceContext.doorRole === "privileged"
    ? deviceContext.doorRole
    : null;

const checkedInBy = json?.debug?.checkedInBy || null;
const scannedByRole = getGateRoleFromCheckedBy(checkedInBy);

const wrongGate =
  !!memberRole &&
  !!doorRole &&
  memberRole !== doorRole &&
  (result === "OK_MEMBER" ||
    result === "OK_PRIORITY" ||
    result === "OK_PRIVILEGED" ||
    result === "ALREADY_CHECKED_IN");

if (wrongGate) {
  json.anomaly = {
    kind: "WRONG_GATE",
    expected_role: memberRole,
    current_role: doorRole,
    scanned_by_role: scannedByRole,
    checked_in_by: checkedInBy,
  };
}

if (doorRole === "ordinary") {
  const allowed =
    (result === "OK_MEMBER" && memberRole === "ordinary") ||
    result === "DENY_WALLY" ||
    result === "DENY_RENEWAL" ||
    (result === "ALREADY_CHECKED_IN" &&
      (memberRole === "ordinary" || memberRole == null));

if (!allowed && !json.anomaly) {
  setLastQr(value);
  return;
}

}

if (doorRole === "loyalty") {
  const allowed =
    result === "OK_PRIORITY" ||
    (result === "ALREADY_CHECKED_IN" && memberRole === "loyalty");

  if (!allowed) {
    setLastQr(value);
    return;
  }
}

if (doorRole === "privileged") {
  const allowed =
    result === "OK_PRIVILEGED" ||
    (result === "ALREADY_CHECKED_IN" && memberRole === "privileged");

  if (!allowed) {
    setLastQr(value);
    return;
  }
}

setResponse(json);
setLastQr(value);
void registerNonMemberAttempt(json);

      } catch (error) {
        const msg = error instanceof Error ? error.message : "Errore di rete";
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
    [
      deviceContext.gateId,
      deviceContext.doorRole,
      deviceContext.deviceLabel,
      selectedEventId,
      response?.event?.id,
      registerNonMemberAttempt,
    ]
  );


  const loadLatestCheckedInResult = useCallback(
    async (eventId: string) => {
      try {
        const liveUrl = new URL(
          "/api/door/live-latest",
          window.location.origin
        );

        liveUrl.searchParams.set("eventId", eventId);

        const res = await fetch(liveUrl.toString(), {
          method: "GET",
          cache: "no-store",
        });

        const json = (await res.json()) as {
          ok: boolean;
          item?: DoorLiveEventRow | null;
        };

        if (selectedEventIdRef.current !== eventId) return;
        if (!res.ok || !json?.ok || !json?.item) return;

        const item = json.item;
        const nextKey = item.live_key || "";

        if (!nextKey) return;
        if (nextKey === lastLiveTicketKey) return;



const currentGateId = deviceContext.gateId?.trim() || null;
const checkedInByForFilter = item.payload_json?.debug?.checkedInBy || null;
const mappedGateIdForFilter = getGateIdFromCheckedBy(checkedInByForFilter);
const itemGateId = mappedGateIdForFilter || item.gate_id?.trim() || null;

if (currentGateId && itemGateId && currentGateId !== itemGateId) {
  return;
}



const payload = item.payload_json;
if (!payload) return;



const checkedInByForGate = payload?.debug?.checkedInBy || null;
const mappedGateId = getGateIdFromCheckedBy(checkedInByForGate);

const payloadWithGate: DoorApiResponse = {
  ...payload,
  gate_id: mappedGateId || item.gate_id || null,
};



const result = payloadWithGate?.result;
const memberRole = payloadWithGate?.member?.door_role || null;
const doorRole =
  deviceContext.doorRole === "ordinary" ||
  deviceContext.doorRole === "loyalty" ||
  deviceContext.doorRole === "privileged"
    ? deviceContext.doorRole
    : null;

const checkedInBy = payloadWithGate?.debug?.checkedInBy || null;
const scannedByRole = getGateRoleFromCheckedBy(checkedInBy);

const wrongGate =
  !!memberRole &&
  !!doorRole &&
  memberRole !== doorRole &&
  (result === "OK_MEMBER" ||
    result === "OK_PRIORITY" ||
    result === "OK_PRIVILEGED" ||
    result === "ALREADY_CHECKED_IN");

if (wrongGate) {
  payloadWithGate.anomaly = {
    kind: "WRONG_GATE",
    expected_role: memberRole,
    current_role: doorRole,
    scanned_by_role: scannedByRole,
    checked_in_by: checkedInBy,
  };
}



if (doorRole === "ordinary") {
  const allowed =
    (result === "OK_MEMBER" && memberRole === "ordinary") ||
    result === "DENY_WALLY" ||
    result === "DENY_RENEWAL" ||
    (result === "ALREADY_CHECKED_IN" &&
      (memberRole === "ordinary" || memberRole == null));

  if (!allowed && !payloadWithGate.anomaly) return;
}

if (doorRole === "loyalty") {
  const allowed =
    result === "OK_PRIORITY" ||
    (result === "ALREADY_CHECKED_IN" && memberRole === "loyalty");

  if (!allowed && !payloadWithGate.anomaly) return;
}

if (doorRole === "privileged") {
  const allowed =
    result === "OK_PRIVILEGED" ||
    (result === "ALREADY_CHECKED_IN" && memberRole === "privileged");

  if (!allowed && !payloadWithGate.anomaly) return;
}

if (selectedEventIdRef.current !== eventId) return;


setResponse(payloadWithGate);
setLastLiveTicketKey(nextKey);
setCopyMessage(null);
void registerNonMemberAttempt(payloadWithGate);

        if (item.ticket_qr_code) {
          setLastQr(item.ticket_qr_code);
          setManualQr(item.ticket_qr_code);
        }
      } catch (error) {
        console.error("Errore loadLatestCheckedInResult", error);
      }
    },
[
  lastLiveTicketKey,
  deviceContext.gateId,
  deviceContext.doorRole,
  registerNonMemberAttempt,
]
  );

const pollLiveOnly = useCallback(async () => {
  const localEventId = selectedEventIdRef.current?.trim();
  if (!localEventId) return;

  try {
await loadLatestCheckedInResult(localEventId);
  } catch (error) {
    console.error("Errore pollLiveOnly", error);
  }
}, [loadLatestCheckedInResult]);


  const refreshDoorData = useCallback(async () => {
    try {
      if (syncing) return;

      setSyncing(true);
      setUiError(null);

      const localEventId = selectedEventId || null;

      if (!localEventId) {
        throw new Error("Seleziona un evento prima di eseguire il sync");
      }

      const syncUrl = new URL(
        "/api/xceed/sync-tickets",
        window.location.origin
      );

      syncUrl.searchParams.set("localEventId", localEventId);

      if (deviceContext.gateId) {
        syncUrl.searchParams.set("gate_id", deviceContext.gateId);
      }

      if (deviceContext.doorRole) {
        syncUrl.searchParams.set("door_role", deviceContext.doorRole);
      }

      if (deviceContext.deviceLabel) {
        syncUrl.searchParams.set("device_label", deviceContext.deviceLabel);
      }

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

setLastSyncAt(Date.now());

await loadLatestCheckedInResult(localEventId);
await loadEventSummary(localEventId);


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
    deviceContext.gateId,
    deviceContext.doorRole,
    deviceContext.deviceLabel,
    loadLatestCheckedInResult,
    loadEventSummary,
  ]);

  const searchMembers = useCallback(async (q: string) => {
    setMemberSearchQuery(q);
    setMemberSearchError(null);

    if (q.trim().length < 2) {
      setMemberSearchResults([]);
      return;
    }

    try {
      setMemberSearchLoading(true);

const params = new URLSearchParams();
params.set("q", q.trim());

if (selectedEventIdRef.current) {
  params.set("eventId", selectedEventIdRef.current);
}

const res = await fetch(`/api/door/member-search?${params.toString()}`, {
  method: "GET",
  cache: "no-store",
});

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Errore ricerca soci");
      }

      setMemberSearchResults(Array.isArray(json.items) ? json.items : []);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Errore ricerca soci";
      setMemberSearchError(msg);
      setMemberSearchResults([]);
    } finally {
      setMemberSearchLoading(false);
    }
  }, []);

  async function linkMemberToCurrentTicket(member: MemberSearchRow) {
    const currentEventId = response?.event?.id?.trim() || selectedEventId.trim() || "";

    const currentBookingId =
      response?.ticket?.booking_id?.trim() ||
      response?.ticket?.transaction_id?.trim() ||
      null;

    const currentTicketQrCode = response?.ticket?.qr_code?.trim() || "";
    const currentTicketFullName = response?.ticket?.full_name?.trim() || personName || null;

    const linkedMemberId = member.id?.trim() || "";
    const linkedMemberName =
      `${member.first_name || ""} ${member.last_name || ""}`.trim() || "—";

    const linkedBy =
      deviceContext.deviceLabel?.trim() ||
      deviceContext.gateId?.trim() ||
      "door-staff";

    const gateId = deviceContext.gateId?.trim() || null;

    if (!currentEventId) {
      setManualLinkMessage("Event ID mancante");
      return;
    }

    if (!currentTicketQrCode) {
      setManualLinkMessage("QR ticket corrente mancante");
      return;
    }

    if (!linkedMemberId) {
      setManualLinkMessage("Member ID mancante");
      return;
    }

    try {
      setManualLinkSaving(true);
      setManualLinkMessage(null);

      const res = await fetch("/api/door/manual-member-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: currentEventId,
          booking_id: currentBookingId,
          ticket_qr_code: currentTicketQrCode,
          ticket_full_name: currentTicketFullName,
          linked_member_id: linkedMemberId,
          linked_member_name: linkedMemberName,
          linked_by: linkedBy,
          gate_id: gateId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Errore salvataggio link manuale");
      }

      if (json?.unchanged === true) {
        setManualLinkType("unchanged");
        setManualLinkMessage("Questo socio è già collegato al ticket");
      } else if (json?.created === true) {
        setManualLinkType("created");
        setManualLinkMessage("Socio collegato al ticket corrente");
      } else {
        setManualLinkType("updated");
        setManualLinkMessage("Collegamento ticket aggiornato");
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Errore collegamento socio-ticket";
      setManualLinkMessage(msg);
    } finally {
      setManualLinkSaving(false);
    }
  }

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
            //
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

  const unlockAudio = useCallback(async () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) return false;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      if (audioContextRef.current.state !== "running") {
        await audioContextRef.current.resume();
      }

      setAudioEnabled(audioContextRef.current.state === "running");

      if (audioContextRef.current.state === "running") {
        playDoorToneWithContext(audioContextRef.current, "OK_MEMBER");
      }

      return audioContextRef.current.state === "running";
    } catch {
      setAudioEnabled(false);
      return false;
    }
  }, []);

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
    setCopyMessage(null);
    setManualWallyOpen(false);
    stopScanner();
  }

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      readerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const gateId = params.get("gate_id")?.trim() || null;
    const doorRole = params.get("door_role")?.trim() || null;
    const deviceLabel = params.get("device_label")?.trim() || null;

    setDeviceContext({
      gateId,
      doorRole,
      deviceLabel,
    });
  }, []);

  useEffect(() => {
    void loadDoorEvents();
  }, [loadDoorEvents]);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    setLastLiveTicketKey("");
    setResponse(null);
    setLastQr("");
    setManualQr("");
    setCopyMessage(null);
    setManualWallyOpen(false);
  }, [selectedEventId, deviceContext.gateId]);

  useEffect(() => {
    if (!selectedEventId) return;
    void loadLatestCheckedInResult(selectedEventId);
  }, [selectedEventId, loadLatestCheckedInResult]);

  useEffect(() => {
    if (!selectedEventId) {
      setEventSummary(null);
      return;
    }

    void loadEventSummary(selectedEventId);
  }, [selectedEventId, loadEventSummary]);

useEffect(() => {
  if (!selectedEventId) return;
  if (!autoRefreshEnabled) return;

  const interval = setInterval(() => {
    if (document.hidden) return;
    void pollLiveOnly();
  }, 2000);
  return () => clearInterval(interval);
}, [selectedEventId, autoRefreshEnabled, pollLiveOnly]);



// 👇 QUI INCOLLI IL NUOVO BLOCCO

useEffect(() => {
  const onVisible = () => {
    if (document.hidden) return;
    if (!selectedEventIdRef.current) return;
    if (!autoRefreshEnabled) return;
    void pollLiveOnly();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}, [autoRefreshEnabled, pollLiveOnly]);

  useEffect(() => {
    const key =
      response?.live_key ||
      response?.ticket?.id ||
      response?.ticket?.qr_code ||
      "";

    if (!key) return;
    if (lastSoundKeyRef.current === key) return;

    lastSoundKeyRef.current = key;

    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (ctx.state !== "running") return;

    playDoorToneWithContext(ctx, response?.result);
  }, [response]);

  const showAutomaticWally = Boolean(response?.action === "OPEN_WALLY" && wallyActionUrl);
  const showManualWally = Boolean(manualWallyOpen && wallyActionUrl);

  const bigTitle = response?.title || "DOOR CHECK";
  const bigMessage =
    response?.message || "Monitor porta: Xceed scansiona, qui controlli l’esito";

  return (
    <div className={`min-h-screen text-white ${theme.shell}`}>
      <div className="mx-auto max-w-7xl px-2 py-2 sm:px-3 sm:py-3 md:px-4">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(18,22,38,0.96),rgba(28,18,50,0.92),rgba(8,10,20,0.98))] p-2.5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-3 md:p-4">
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.spotlight}`} />

          <div className="relative z-10 space-y-3">
            <div className={`rounded-[20px] border p-2.5 sm:p-3 ${roleAppearance.panel}`}>
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${roleAppearance.chip}`}>
                      {roleAppearance.label}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">
                      Evento attivo
                    </span>
                  </div>

                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white outline-none"
                  >
                    <option value="" className="bg-slate-950 text-white">
                      {loadingEvents ? "Caricamento eventi..." : "Seleziona evento"}
                    </option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id} className="bg-slate-950 text-white">
                        {event.name}
                        {event.city ? ` - ${event.city}` : ""}
                        {event.venue ? ` - ${event.venue}` : ""}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-200/85">
                    <span className={`font-semibold ${roleAppearance.soft}`}>{roleAppearance.title}</span>
                     <span>
                    Gate: {deviceContext.gateId || "—"}
                   </span>
                   <span>
                   Mail Xceed: {assignedGateEmail || "—"}
                   </span>

                    {selectedEvent?.city ? <span>{selectedEvent.city}</span> : null}
                    {selectedEvent?.venue ? <span>{selectedEvent.venue}</span> : null}
                  </div>

                  {uiError ? (
                    <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-2.5 text-xs text-red-200">
                      {uiError}
                    </div>
                  ) : null}
                </div>






<div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">

  {/* TOTAL */}
  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Tot</div>
    <div className="mt-1 text-base font-bold">
      {loadingSummary ? "..." : eventSummary?.total_tickets ?? 0}
    </div>
  </div>

  {/* IN */}
  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">In</div>
    <div className="mt-1 text-base font-bold">
      {loadingSummary ? "..." : eventSummary?.entered_tickets ?? 0}
    </div>
  </div>

  {/* OUT */}
  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Out</div>
    <div className="mt-1 text-base font-bold">
      {loadingSummary ? "..." : eventSummary?.missing_tickets ?? 0}
    </div>
  </div>

{/* TICKET */}
<div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Ticket</div>
  <div className="mt-1 text-base font-bold">
    {loadingSummary
      ? "..."
      : `${eventSummary?.type_summary.ticket.in ?? 0}/${eventSummary?.type_summary.ticket.total ?? 0}`}
  </div>
</div>

{/* GUEST */}
<div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Guest</div>
  <div className="mt-1 text-base font-bold">
    {loadingSummary
      ? "..."
      : `${eventSummary?.type_summary.guest.in ?? 0}/${eventSummary?.type_summary.guest.total ?? 0}`}
  </div>
</div>

{/* TABLE */}
<div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Table</div>
  <div className="mt-1 text-base font-bold">
    {loadingSummary
      ? "..."
      : `${eventSummary?.type_summary.table.in ?? 0}/${eventSummary?.type_summary.table.total ?? 0}`}
  </div>
</div>

{/* CANCELLED */}
<div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Canc</div>
  <div className="mt-1 text-base font-bold">
    {loadingSummary ? "..." : eventSummary?.type_summary.cancelled.total ?? 0}
  </div>
</div>

{/* DRINK */}
<div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-center">
  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Drink</div>
  <div className="mt-1 text-base font-bold">
    {loadingSummary
      ? "..."
      : `${eventSummary?.type_summary.drink.in ?? 0}/${eventSummary?.type_summary.drink.total ?? 0}`}
  </div>
</div>

  <button
    onClick={async () => {
  await unlockAudio();
  await refreshDoorData();
}}

    disabled={syncing || loading}
    className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {syncing ? "Sync..." : "Aggiorna"}
  </button>

<button
  onClick={() => setAutoRefreshEnabled((prev) => !prev)}
  className={`rounded-2xl border px-3 py-2 text-[11px] font-medium transition ${
    autoRefreshEnabled
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
      : "border-white/15 bg-white/5 text-white hover:bg-white/10"
  }`}
>
  {autoRefreshEnabled ? "AUTO" : "MANUALE"}
</button>

  <button
    onClick={async () => {
      await unlockAudio();
    }}
    className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-white/10"
  >
    {audioEnabled ? "Audio ok" : "Audio"}
  </button>
</div>

              </div>
            </div>

            <div className={`rounded-[22px] border p-3 sm:p-4 ${theme.border} ${theme.card} ${theme.glow}`}>
              {!isNonMemberCase ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${theme.badge}`}>
                      {response?.badge || "Door"}
                    </span>

                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${uiStatus.className}`}>
                      {uiStatus.label}
                    </span>

                    <span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${roleAppearance.chip}`}>
                      {roleAppearance.label}
                    </span>

                    {response?.debug?.source ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-100">
                        source: {response.debug.source}
                      </span>
                    ) : null}

                    {response?.debug?.matched_by ? (
                      <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1.5 text-[10px] font-semibold text-fuchsia-100">
                        match: {response.debug.matched_by}
                      </span>
                    ) : null}

                    {lastSyncAt ? (
                      <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] font-semibold text-slate-200">
                        sync {new Date(lastSyncAt).toLocaleTimeString()}
                      </span>
                    ) : null}
{response?.gate_id ? (
  <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] font-semibold text-slate-200">
    gate: {response.gate_id}
  </span>
) : null}

{response?.anomaly?.kind === "WRONG_GATE" ? (
  <div className="w-full rounded-2xl border border-orange-300/30 bg-orange-400/10 p-3 text-sm text-orange-100">
    <div className="font-bold uppercase tracking-[0.14em]">
      ANOMALIA PORTA
    </div>
    <div className="mt-1">
      Socio{" "}
      <span className="font-semibold">
        {response?.member?.door_role || "—"}
      </span>{" "}
      presentato su porta{" "}
      <span className="font-semibold">
        {deviceContext.doorRole || "—"}
      </span>.
    </div>
    <div className="mt-1 text-xs text-orange-200/90">
      Scanner Xceed: {response?.anomaly?.checked_in_by || "—"}
      {response?.anomaly?.scanned_by_role
        ? ` · gate scanner: ${response.anomaly.scanned_by_role}`
        : ""}
    </div>
  </div>
) : null}



                  </div>

                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-3">
                      <div>
                        <div className={`text-sm font-semibold uppercase tracking-[0.18em] ${roleAppearance.subtle}`}>
                          {bigTitle}
                        </div>
                        <div className="mt-1 text-3xl font-bold leading-[1.02] text-white sm:text-4xl md:text-5xl">
                          {personName}
                        </div>

<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-200">
  <span>{personEmail}</span>
  {response?.person?.phone ? <span>• {response.person.phone}</span> : null}
</div>

<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.12em]">
  <span className="text-slate-400">
    Ruolo persona:
    <span className="ml-1 font-semibold text-white">
      {response?.member?.door_role || "—"}
    </span>
  </span>

  <span className="text-slate-400">
    Gruppo:
    <span className={`ml-1 font-semibold ${roleAppearance.soft}`}>
      {response?.member?.membership_group || "—"}
    </span>
  </span>
</div>

                        <div className={`mt-2 text-xs sm:text-sm ${theme.accent}`}>
                          {bigMessage}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">

                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Booking</div>
                          <div className="mt-1 text-xl font-bold text-white">
                            {bookingSummary ? bookingSummary.ticketCount : "—"}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {bookingSummary
                              ? bookingSummary.ticketCount === 1
                                ? "biglietto"
                                : "biglietti"
                              : "n.d."}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Progress</div>
                          <div className="mt-1 text-xl font-bold text-white">
                            {bookingSummary ? bookingSummary.progressLabel : "—"}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {bookingSummary
                              ? `Entrati: ${bookingSummary.checkedInCount} su ${bookingSummary.ticketCount}`
                              : "n.d."}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Ticket</div>
                         <div className="mt-1 text-base font-bold text-white">
                            {response?.ticket?.status || "—"}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {response?.ticket?.offer_type || response?.ticket?.offer_name || "n.d."}
                          </div>
                        </div>

<div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Porta</div>
  <div className={`mt-1 text-base font-bold ${roleAppearance.soft}`}>
    {(deviceContext.doorRole || "ordinary").toUpperCase()}
  </div>
  <div className="text-[11px] text-slate-300">
    {response?.gate_id || "—"}
  </div>
</div>
                     </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <button
                          type="button"
                          onClick={() => {
                            setManualLinkMessage(null);
                            setOpenMemberSearch(true);
                          }}
                          className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-400/15"
                        >
                          Cerca socio
                        </button>

                        {wallyActionUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setManualWallyOpen((prev) => !prev)}
                              className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/10 px-4 py-3 text-xs font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/15"
                            >
                              {manualWallyOpen ? "Chiudi QR" : "Apri QR"}
                            </button>

                            <a
                              href={wallyActionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-center text-xs font-semibold text-white transition hover:bg-white/12"
                            >
                              Apri Wally
                            </a>

                            <button
                              type="button"
                              onClick={() => void copyToClipboard(wallyActionUrl)}
                              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-semibold text-white transition hover:bg-white/10"
                            >
                              Copia link
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-xs text-slate-400">
                              QR n.d.
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-xs text-slate-400">
                              Wally n.d.
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-xs text-slate-400">
                              Link n.d.
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {(showAutomaticWally || showManualWally) && wallyActionUrl ? (
                      <div className="rounded-3xl border border-white/10 bg-black/25 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                            Accesso Wally
                          </div>
                          {showAutomaticWally ? (
                            <span className="rounded-full border border-rose-300/25 bg-rose-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-100">
                              automatico
                            </span>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-[140px_1fr] xl:grid-cols-1">
                          <div className="mx-auto flex w-fit items-center justify-center rounded-3xl border border-white/10 bg-white p-3">
                            <QRCode
                              value={wallyActionUrl}
                              size={140}
                              bgColor="#FFFFFF"
                              fgColor="#000000"
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="text-lg font-semibold text-white">
                              Tessera / rinnovo
                            </div>
                            <div className="text-xs text-slate-300">
                              Scansiona il QR o apri il link diretto.
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-300 break-all">
                              {wallyActionUrl}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <a
                                href={wallyActionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-center text-xs font-semibold transition hover:bg-white/15"
                              >
                                Apri Wally
                              </a>

                              <button
                                type="button"
                                onClick={() => void copyToClipboard(wallyActionUrl)}
                                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold transition hover:bg-white/10"
                              >
                                Copia link
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {copyMessage ? (
                    <div className="text-xs text-slate-300">{copyMessage}</div>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${uiStatus.className}`}>
                        {uiStatus.label}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${roleAppearance.chip}`}>
                        {roleAppearance.label}
                      </span>
                      {lastSyncAt ? (
                        <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[10px] font-semibold text-slate-200">
                          sync {new Date(lastSyncAt).toLocaleTimeString()}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-3xl font-bold tracking-tight text-rose-50 sm:text-4xl">
                        NON SOCIO
                      </div>
                      <div className="mt-1 text-sm font-medium text-rose-200">
                        Tessera / rinnovo richiesto
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">
                      Questo ospite non è socio, esibisce solo biglietto Xceed.
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="text-2xl font-bold text-white sm:text-3xl">
                        {personName}
                      </div>
                      <div className="mt-1 text-sm text-slate-200">
                        {personEmail}
                      </div>
                    </div>

                    {bookingSummary ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Booking</div>
                          <div className="mt-1 text-xl font-bold text-white">{bookingSummary.ticketCount}</div>
                          <div className="text-[11px] text-slate-300">biglietti</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Progress</div>
                          <div className="mt-1 text-xl font-bold text-white">{bookingSummary.progressLabel}</div>
                          <div className="text-[11px] text-slate-300">
                            Entrati: {bookingSummary.checkedInCount} su {bookingSummary.ticketCount}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {wallyActionUrl ? (
                        <a
                          href={wallyActionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-2xl border border-rose-300/30 bg-rose-500/20 px-4 py-3 text-center text-xs font-semibold text-rose-50 transition hover:bg-rose-500/30"
                        >
                          Apri Wally
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          setManualLinkMessage(null);
                          setOpenMemberSearch(true);
                          setManualLinkType(null);
                        }}
                        className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-400/15"
                      >
                        Cerca socio
                      </button>

                      {wallyActionUrl ? (
                        <button
                          type="button"
                          onClick={() => setManualWallyOpen((prev) => !prev)}
                          className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/10 px-4 py-3 text-xs font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/15"
                        >
                          {manualWallyOpen ? "Chiudi QR" : "Apri QR"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/25 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
                        Accesso Wally
                      </div>
                      {showAutomaticWally ? (
                        <span className="rounded-full border border-rose-300/25 bg-rose-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-rose-100">
                          automatico
                        </span>
                      ) : null}
                    </div>

                    {wallyActionUrl ? (
                      <>
                        <div className="mx-auto flex w-fit items-center justify-center rounded-3xl border border-white/10 bg-white p-3">
                          <QRCode
                            value={wallyActionUrl}
                            size={180}
                            bgColor="#FFFFFF"
                            fgColor="#000000"
                          />
                        </div>

                        <div className="mt-3 text-base font-semibold text-white">
                          Fai tessera dal telefono
                        </div>

                        <div className="mt-1 text-xs text-slate-300">
                          Scansiona il QR o clicca Apri Wally ora.
                        </div>

                        <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-300 break-all">
                          {wallyActionUrl}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <a
                            href={wallyActionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-center text-xs font-semibold transition hover:bg-white/15"
                          >
                            Apri Wally
                          </a>

                          <button
                            type="button"
                            onClick={() => void copyToClipboard(wallyActionUrl)}
                            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
                          >
                            Copia link
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                        Nessun link Wally disponibile.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

<div className="grid gap-3 xl:grid-cols-2">
<div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
    Dati socio
  </div>
  {row("Ruolo persona", response?.member?.door_role)}
  {row("Gruppo socio", response?.member?.membership_group)}
  {row("Status", response?.member?.status)}
  {row("Scadenza", response?.member?.membership_expires_at)}
  {row("Member ID", response?.member?.id)}
</div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  Dati ticket
                </div>
                {row("QR", response?.ticket?.qr_code)}
                {row("Source", response?.ticket?.source)}
                {row("Status", response?.ticket?.status)}
                {row("Checked in", String(response?.ticket?.checked_in ?? false))}
                {row("Offer type", response?.ticket?.offer_type)}
                {row("Offer name", response?.ticket?.offer_name)}
                {row("Booking ID", response?.ticket?.booking_id)}
                {row("Transaction", response?.ticket?.transaction_id)}
                {row("Event ID", response?.ticket?.event_id)}
                {row("Nome", response?.ticket?.full_name)}
                {row("Email", response?.ticket?.email)}
                {row("Buyer", response?.ticket?.buyer_email)}
              </div>

              {response?.booking ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl xl:col-span-2">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                    Booking progress
                  </div>
                  {row("Booking ID", response.booking.booking_id)}
                  {row("Totale", String(response.booking.ticket_count))}
                  {row("Entrati", String(response.booking.checked_in_count))}
                  {row("Progress", response.booking.progress_label)}
                </div>
              ) : null}

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl xl:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  Policy evento
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Require ticket</div>
                    <div className="mt-1 text-base font-semibold text-white">
                      {String(response?.event?.require_ticket ?? false)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Require membership</div>
                    <div className="mt-1 text-base font-semibold text-white">
                      {String(response?.event?.require_membership ?? false)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Require active</div>
                    <div className="mt-1 text-base font-semibold text-white">
                      {String(response?.event?.require_active_membership ?? false)}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  {row("Evento locale", response?.event?.id)}
                  {row("Xceed UUID", response?.event?.xceed_event_uuid)}
                  {row("Xceed ref", response?.event?.xceed_event_ref)}
                </div>
              </div>

              {response?.error ? (
                <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200 xl:col-span-2">
                  {response.error}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  Scanner / input QR
                </div>

                <div className="grid gap-3 lg:grid-cols-[190px_1fr]">
                  <div>
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                      <video
                        ref={videoRef}
                        className="aspect-[3/4] w-full object-cover"
                        muted
                        playsInline
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={async () => {
                          await unlockAudio();
                          void startScanner();
                        }}
                        className={`rounded-2xl border px-3 py-2 text-[11px] font-medium transition ${roleAppearance.button}`}
                      >
                        {scanActive ? "Scanner attivo" : "Avvia scanner"}
                      </button>

                      <button
                        onClick={stopScanner}
                        className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-white/10"
                      >
                        Stop
                      </button>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-400">
                      La scansione ufficiale resta su Xceed app.
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[11px] font-medium text-slate-300">
                      Input manuale QR
                    </div>

                    <textarea
                      value={manualQr}
                      onChange={(e) => setManualQr(e.target.value)}
                      placeholder="Incolla qui il QR code"
                      className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-xs text-white outline-none placeholder:text-slate-500"
                    />

                    <button
                      onClick={async () => {
                        await unlockAudio();
                        void evaluateQr(manualQr);
                      }}
                      disabled={!manualQr.trim() || loading}
                      className="mt-3 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading ? "Verifica in corso..." : "Verifica QR"}
                    </button>

                    {lastQr ? (
                      <div className="mt-2 text-[11px] text-slate-400 break-all">
                        Ultimo QR: {lastQr}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  Nota operativa
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                  Vista compatta orientata al controllo immediato. In alto: ruolo porta, esito, nome, progress e azioni. Sotto: dettagli e strumenti staff.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {openMemberSearch ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-4 max-w-2xl rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(18,22,38,0.98),rgba(28,18,50,0.96),rgba(8,10,20,0.99))] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">
                  Door support
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Ricerca Soci
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpenMemberSearch(false);
                  setManualLinkMessage(null);
                }}
                className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10"
              >
                Chiudi
              </button>
            </div>

            <input
              autoFocus
              value={memberSearchQuery}
              onChange={(e) => void searchMembers(e.target.value)}
              placeholder="Nome, cognome, email o telefono"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
            />

            <div className="mt-3 text-[11px] text-slate-400">
              Verifica rapida porta: nome, email o telefono.
            </div>

            {memberSearchLoading ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300">
                Ricerca in corso...
              </div>
            ) : null}

            {memberSearchError ? (
              <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
                {memberSearchError}
              </div>
            ) : null}

            {manualLinkMessage ? (
              <div
                className={`mt-4 rounded-2xl p-3 text-xs ${
                  manualLinkType === "created"
                    ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                    : manualLinkType === "updated"
                    ? "border border-blue-300/20 bg-blue-400/10 text-blue-100"
                    : manualLinkType === "unchanged"
                    ? "border border-amber-300/20 bg-amber-400/10 text-amber-100"
                    : "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
                }`}
              >
                {manualLinkMessage}
              </div>
            ) : null}

            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {!memberSearchLoading &&
              !memberSearchError &&
              memberSearchQuery.trim().length >= 2 &&
              memberSearchResults.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300">
                  Nessun socio trovato.
                </div>
              ) : null}

              {memberSearchResults.map((m) => {
                const full = `${m.first_name || ""} ${m.last_name || ""}`.trim() || "—";
                const isActive =
                  String(m.status || "").toUpperCase().includes("ATTIV") ||
                  String(m.status || "").toUpperCase() === "ACTIVE";

                return (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {full}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {m.email || "—"}
                          {m.phone ? ` · ${m.phone}` : ""}
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          isActive
                            ? "border border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                            : "border border-rose-300/25 bg-rose-400/10 text-rose-100"
                        }`}
                      >
                        {m.status || "—"}
                      </span>
                    </div>

<div
  className={`mt-3 rounded-2xl border p-3 ${
    m.already_entered
      ? "border-emerald-300/25 bg-emerald-400/10"
      : "border-white/10 bg-black/20"
  }`}
>
  <div
    className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
      m.already_entered ? "text-emerald-100" : "text-slate-400"
    }`}
  >
    {m.already_entered ? "Già entrato" : "Non ancora entrato"}
  </div>

  {m.already_entered ? (
    <div className="mt-2 grid gap-1 text-[11px] text-slate-200">
      <div>
        Ora:{" "}
        <span className="font-semibold text-white">
          {m.entered_at ? new Date(m.entered_at).toLocaleString() : "—"}
        </span>
      </div>
      <div>
        Gate:{" "}
        <span className="font-semibold text-white">
          {m.entered_gate || "—"}
        </span>
      </div>
      <div>
        Operatore:{" "}
        <span className="font-semibold text-white">
          {m.entered_by || "—"}
        </span>
      </div>
      <div>
        Match:{" "}
        <span className="font-semibold text-white">
          {m.entered_match || "—"}
        </span>
      </div>
      <div className="break-all">
        QR:{" "}
        <span className="font-semibold text-white">
          {m.entered_qr || "—"}
        </span>
      </div>
      <div>
        Esito:{" "}
        <span className="font-semibold text-white">
          {m.entered_result || "—"}
        </span>
      </div>
      <div>
        Ticket:{" "}
        <span className="font-semibold text-white">
          {m.entered_ticket_name || "—"}
        </span>
      </div>
    </div>
  ) : (
    <div className="mt-1 text-[11px] text-slate-400">
      Nessun ingresso trovato per questo evento.
    </div>
  )}
</div>





                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          Gruppo
                        </div>
                        <div className="mt-1 text-xs text-white">
                          {m.membership_group || "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          Scadenza
                        </div>
                        <div className="mt-1 text-xs text-white">
                          {m.membership_expires_at || "—"}
                        </div>
                      </div>


{m.already_entered ? (
  <div className="text-[11px] text-amber-200">
    ⚠️ Questo socio risulta già entrato all’evento
  </div>
) : null}

<button
  type="button"
  onClick={() => void linkMemberToCurrentTicket(m)}
  disabled={
    manualLinkSaving ||
    !response?.ticket?.qr_code ||
    !response?.event?.id ||
    m.already_entered === true
  }
className="mt-1 w-full rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40 md:col-span-2"
                      >
{manualLinkSaving
  ? "Salvataggio collegamento..."
  : m.already_entered
  ? "Socio già entrato"
  : "Collega questo socio al ticket corrente"}

                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}