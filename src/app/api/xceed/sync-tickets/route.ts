import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateDoorXceedLive } from "@/lib/door/xceed-live-evaluate-core";

type XceedTicket = {
  qrCode: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  hasCheckedIn?: boolean;
  checkedInTime?: number | null;
  isActive?: boolean | null;
  offer?: {
    id?: number | null;
    uuid?: string | null;
    type?: string | null;
    name?: string | null;
    description?: string | null;
  } | null;
  booking?: {
    bookingId?: number | null;
    bookingUuid?: string | null;
    purchasedAt?: number | null;
    updatedAt?: number | null;
    confirmed?: boolean | null;
    channel?: {
      id?: string | null;
      legacyId?: number | null;
      name?: string | null;
      slug?: string | null;
    } | null;
  } | null;
};

type XceedTicketsResponse = {
  success: boolean;
  data: XceedTicket[];
};

type XceedBookingPass = {
  qrCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  hasCheckedIn?: boolean;
  checkedInTime?: number | null;
  isActive?: boolean | null;
};

type XceedBooking = {
  id?: string | null;
  legacyId?: number | null;
  buyer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  passes?: XceedBookingPass[] | null;
  offer?: {
    id?: string | null;
    type?: string | null;
    name?: string | null;
    description?: string | null;
  } | null;
  channel?: {
    id?: string | null;
    legacyId?: number | null;
    name?: string | null;
    slug?: string | null;
  } | null;
  purchasedAt?: number | null;
  confirmed?: boolean | null;
};

type XceedBookingsResponse = {
  success: boolean;
  data: XceedBooking[];
};

type XceedTicketRowRaw = {
  source: "tickets" | "bookings_only" | "tickets+bookings_merge";
  xceed_event_ref: string;
  xceed_event_uuid: string | null;
checkedInBy?: string | null;
  synced_at: string;
  offer: {
    type: string | null;
    name: string | null;
    description: string | null;
  };
  booking?: any;
  ticket?: any;
  pass?: any;
};

type XceedTicketRow = {
  event_id: string;
  qr_code: string;
  status: "cancelled" | "checked_in" | "active";
  full_name: string | null;
  email: string | null;
  phone: string | null;
  booking_date: string | null;
  transaction_id: string | null;
  imported_at: string;
  raw: XceedTicketRowRaw;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_email_norm: string | null;
  buyer_phone_norm: string | null;
};

type BookingPassIndexItem = {
  booking: XceedBooking;
  pass: XceedBookingPass;
};

type DoorLiveInsertRow = {
  event_id: string;
  gate_id: string;
  live_key: string;
  ticket_id: string | null;
  ticket_qr_code: string | null;
  payload_json: any;
};

function buildDoorLiveKey(eventId: string, qrCode: string) {
  return `${eventId}__${qrCode}__checked_in`;
}

type GateEmailConfig = {
  gate_id: string;
  door_role: "ordinary" | "loyalty";
};

const GATE_EMAIL_MAP: Record<string, GateEmailConfig> = {
  "ledvelvetstaff@gmail.com": { gate_id: "gate_1", door_role: "ordinary" },
  "annafilippi003@gmail.com": { gate_id: "gate_2", door_role: "ordinary" },
  "giulianassi00@gmail.com": { gate_id: "gate_3", door_role: "ordinary" },
  "eleonorabuti2@gmail.com": { gate_id: "gate_4", door_role: "loyalty" },
  "shorttermrentaleasy@gmail.com": { gate_id: "gate_5", door_role: "loyalty" },
};

function normalizeGateEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function getGateConfigFromCheckedBy(value?: string | null): GateEmailConfig | null {
  const email = normalizeGateEmail(value);
  return GATE_EMAIL_MAP[email] || null;
}


async function insertDoorLiveEvents(params: {
  supabase: any;
  req: NextRequest;
  rows: any[];
}) {
  const { supabase, req, rows } = params;

new URL(req.url);


 

  let liveEventsWritten = 0;

  let liveEventsCandidates = 0;




  const liveEventsDebug: Array<{
    qr_code: string | null;
    event_id: string | null;
    live_key: string | null;
    step: "already_exists" | "payload_failed" | "insert_failed" | "insert_ok";
    details?: string | null;
  }> = [];

  for (const row of rows) {
    const eventId = String(row?.event_id || "").trim();
    const qrCode = String(row?.qr_code || "").trim();
    const status = String(row?.status || "").trim().toLowerCase();

    if (!eventId || !qrCode) continue;
    if (status !== "checked_in") continue;

    liveEventsCandidates += 1;

    const liveKey = buildDoorLiveKey(eventId, qrCode);

    const { data: existingLive, error: existingLiveError } = await supabase
      .from("door_live_events")
      .select("id")
      .eq("event_id", eventId)
      .eq("live_key", liveKey)
      .limit(1)
      .maybeSingle();


    if (existingLiveError) {
      liveEventsDebug.push({
        qr_code: qrCode,
        event_id: eventId,
        live_key: liveKey,
        step: "insert_failed",
        details: `existing lookup failed: ${existingLiveError.message}`,
      });
      continue;
    }

    const existingLiveId =
      existingLive && typeof existingLive === "object" && "id" in existingLive
        ? String((existingLive as { id: string }).id)
        : null;

    if (existingLiveId) {
      liveEventsDebug.push({
        qr_code: qrCode,
        event_id: eventId,
        live_key: liveKey,
        step: "already_exists",
        details: existingLiveId,
      });
      continue;
    }

const checkedInBy = row?.raw?.checkedInBy || null;
const gateConfig = getGateConfigFromCheckedBy(checkedInBy);

if (!gateConfig) {
  liveEventsDebug.push({
    qr_code: qrCode,
    event_id: eventId,
    live_key: liveKey,
    step: "payload_failed",
    details: `missing checkedInBy gate mapping: ${checkedInBy || "null"}`,
  });
  continue;
}

const payload = await evaluateDoorXceedLive({
  qrCode,
  eventId,
  gateId: gateConfig.gate_id,
  doorRole: gateConfig.door_role,
});   


    if (!payload?.ok) {
      liveEventsDebug.push({
        qr_code: qrCode,
        event_id: eventId,
        live_key: liveKey,
        step: "payload_failed",
        details: payload ? JSON.stringify(payload).slice(0, 400) : "null payload",
      });
      continue;
    }

        liveEventsWritten += 1;

    liveEventsDebug.push({
      qr_code: qrCode,
      event_id: eventId,
      live_key: liveKey,
      step: "insert_ok",
      details: "live event written by evaluateDoorXceedLive core",
    });
  }

  return {
    liveEventsWritten,
    liveEventsCandidates,
    liveEventsDebug: liveEventsDebug.slice(0, 20),
  };
}

function normalizeEmail(email: string | null | undefined) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@") || !e.includes(".")) return null;
  return e;
}

function normalizePhone(phone: string | null | undefined) {
  let p = String(phone ?? "").trim();
  if (!p) return null;
  p = p.replace(/[^\d+]/g, "");
  if (!p) return null;
  if (/^39\d{8,}$/.test(p)) p = `+${p}`;
  return p.length >= 6 ? p : null;
}

function buildFullName(firstName?: string | null, lastName?: string | null) {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || null;
}

function toIsoFromEpochMaybe(value?: number | null) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeOfferType(v?: string | null) {
  const s = String(v ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!s) return null;
  if (s === "guestlist" || s === "guest-list") return "guest-list";
  if (s === "ticket") return "ticket";
  return s;
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const s = String(value ?? "").trim();
    if (s) return s;
  }
  return null;
}

async function fetchJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const rawText = await response.text();

  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false as const,
      status: response.status,
      rawText,
      parsed: null,
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    rawText,
    parsed,
  };
}

async function fetchAllTicketPages(
  baseUrl: string,
  apiKey: string,
  eventId: string,
  includeCancelledTickets: string,
  pageSize = 100
): Promise<{ ok: boolean; status: number; items: XceedTicket[]; error?: string }> {
  let offset = 0;
  const items: XceedTicket[] = [];
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const url =
      `${baseUrl}/v1/tickets` +
      `?offset=${encodeURIComponent(String(offset))}` +
      `&limit=${encodeURIComponent(String(pageSize))}` +
      `&events=${encodeURIComponent(eventId)}` +
      `&includeCancelledTickets=${encodeURIComponent(includeCancelledTickets)}`;

    const res = await fetchJson(url, apiKey);

    if (!res.parsed) {
      return {
        ok: false,
        status: res.status,
        items,
        error: "Invalid JSON response from Xceed tickets endpoint",
      };
    }

    if (!res.ok || !res.parsed?.success || !Array.isArray(res.parsed.data)) {
      return {
        ok: false,
        status: res.status,
        items,
        error: "Xceed tickets request failed",
      };
    }

    const pageItems = (res.parsed as XceedTicketsResponse).data;
    items.push(...pageItems);

    if (pageItems.length < pageSize) {
      return { ok: true, status: res.status, items };
    }

    offset += pageSize;
  }

  return { ok: true, status: 200, items };
}

async function fetchAllBookingPages(
  baseUrl: string,
  apiKey: string,
  eventId: string,
  includeCancelledTickets: string,
  pageSize = 100
): Promise<{ ok: boolean; status: number; items: XceedBooking[]; error?: string }> {
  let offset = 0;
  const items: XceedBooking[] = [];
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const url =
      `${baseUrl}/v1/bookings` +
      `?offset=${encodeURIComponent(String(offset))}` +
      `&limit=${encodeURIComponent(String(pageSize))}` +
      `&events=${encodeURIComponent(eventId)}` +
      `&includeCancelledTickets=${encodeURIComponent(includeCancelledTickets)}`;

    const res = await fetchJson(url, apiKey);

    if (!res.parsed) {
      return {
        ok: false,
        status: res.status,
        items,
        error: "Invalid JSON response from Xceed bookings endpoint",
      };
    }

    if (!res.ok || !res.parsed?.success || !Array.isArray(res.parsed.data)) {
      return {
        ok: false,
        status: res.status,
        items,
        error: "Xceed bookings request failed",
      };
    }

    const pageItems = (res.parsed as XceedBookingsResponse).data;
    items.push(...pageItems);

    if (pageItems.length < pageSize) {
      return { ok: true, status: res.status, items };
    }

    offset += pageSize;
  }

  return { ok: true, status: 200, items };
}

function buildBookingPassIndex(bookings: XceedBooking[]) {
  const byQr = new Map<string, BookingPassIndexItem>();

  for (const booking of bookings) {
    const passes = Array.isArray(booking.passes) ? booking.passes : [];
    for (const pass of passes) {
      const qr = String(pass.qrCode ?? "").trim();
      if (!qr) continue;
      byQr.set(qr, { booking, pass });
    }
  }

  return byQr;
}
function buildRowFromTicket(params: {
  localEventId: string;
  xceedEventRef: string;
  xceedEventUuid: string | null;
  nowIso: string;
  ticket: XceedTicket;
  bookingPassMatch?: BookingPassIndexItem | null;
}): XceedTicketRow | null {
  const { localEventId, xceedEventRef, xceedEventUuid, nowIso, ticket, bookingPassMatch } = params;

  const qr = String(ticket.qrCode ?? "").trim();
  if (!qr) return null;

  const matchedBooking = bookingPassMatch?.booking ?? null;
  const matchedPass = bookingPassMatch?.pass ?? null;

  const email = normalizeEmail(
    ticket.email ?? matchedPass?.email ?? matchedBooking?.buyer?.email ?? null
  );
  const phone = normalizePhone(
    ticket.phone ?? matchedPass?.phone ?? matchedBooking?.buyer?.phone ?? null
  );

  const fullName =
    buildFullName(ticket.firstName, ticket.lastName) ||
    buildFullName(matchedPass?.firstName, matchedPass?.lastName) ||
    buildFullName(matchedBooking?.buyer?.firstName, matchedBooking?.buyer?.lastName);

  const buyerEmail = normalizeEmail(
    matchedBooking?.buyer?.email ?? ticket.email ?? matchedPass?.email ?? null
  );
  const buyerPhone = normalizePhone(
    matchedBooking?.buyer?.phone ?? ticket.phone ?? matchedPass?.phone ?? null
  );

  const resolvedOfferType = normalizeOfferType(
    pickFirstNonEmpty(matchedBooking?.offer?.type ?? null, ticket.offer?.type ?? null)
  );

  const resolvedOfferName = pickFirstNonEmpty(
    matchedBooking?.offer?.name ?? null,
    ticket.offer?.name ?? null
  );

  const resolvedOfferDescription = pickFirstNonEmpty(
    matchedBooking?.offer?.description ?? null,
    ticket.offer?.description ?? null
  );

  const bookingDate = toIsoFromEpochMaybe(
    matchedBooking?.purchasedAt ?? ticket.booking?.purchasedAt ?? null
  );

  const transactionId = pickFirstNonEmpty(
    matchedBooking?.legacyId != null ? String(matchedBooking.legacyId) : null,
    ticket.booking?.bookingId != null ? String(ticket.booking.bookingId) : null
  );

const status: XceedTicketRow["status"] =
  ticket.isActive === false || matchedPass?.isActive === false
    ? "cancelled"
    : ticket.hasCheckedIn === true ||
      matchedPass?.hasCheckedIn === true ||
      ticket.checkedInTime != null ||
      matchedPass?.checkedInTime != null
    ? "checked_in"
    : "active";

const checkedInBy =
  (ticket as any).pass?.checkedInBy ??
  (matchedPass as any)?.checkedInBy ??
  (ticket as any).checkedInBy ??
  null;

  return {
    event_id: localEventId,
    qr_code: qr,
    status,
    full_name: fullName,
    email,
    phone,
    booking_date: bookingDate,
    transaction_id: transactionId,
    imported_at: nowIso,
    raw: {
      source: matchedBooking ? "tickets+bookings_merge" : "tickets",
      xceed_event_ref: xceedEventRef,
      xceed_event_uuid: xceedEventUuid,
      synced_at: nowIso,    
      checkedInBy,
      offer: {
        type: resolvedOfferType,
        name: resolvedOfferName,
        description: resolvedOfferDescription,
      },
      booking: matchedBooking,
      ticket,
      pass: matchedPass,
    },
    buyer_email: buyerEmail,
    buyer_phone: buyerPhone,
    buyer_email_norm: buyerEmail,
    buyer_phone_norm: buyerPhone,
  };
}

function buildRowsFromBookingsOnly(params: {
  localEventId: string;
  xceedEventRef: string;
  xceedEventUuid: string | null;
  nowIso: string;
  bookings: XceedBooking[];
  skipQrs?: Set<string>;
}) {
  const { localEventId, xceedEventRef, xceedEventUuid, nowIso, bookings, skipQrs } = params;
  const rows: XceedTicketRow[] = [];

  for (const booking of bookings) {
    const passes = Array.isArray(booking.passes) ? booking.passes : [];

    for (const pass of passes) {
      const qr = String(pass.qrCode ?? "").trim();
      if (!qr) continue;
      if (skipQrs?.has(qr)) continue;

      const email = normalizeEmail(pass.email ?? booking.buyer?.email ?? null);
      const phone = normalizePhone(pass.phone ?? booking.buyer?.phone ?? null);

      const fullName =
        buildFullName(pass.firstName, pass.lastName) ||
        buildFullName(booking.buyer?.firstName, booking.buyer?.lastName);

      const buyerEmail = normalizeEmail(booking.buyer?.email ?? null);
      const buyerPhone = normalizePhone(booking.buyer?.phone ?? null);

      rows.push({
        event_id: localEventId,
        qr_code: qr,
        status:
          pass.isActive === false
            ? "cancelled"
            : pass.hasCheckedIn
            ? "checked_in"
            : "active",
        full_name: fullName,
        email,
        phone,
        booking_date: toIsoFromEpochMaybe(booking.purchasedAt),
        transaction_id: booking.legacyId != null ? String(booking.legacyId) : null,
        imported_at: nowIso,
        raw: {
          source: "bookings_only",
          xceed_event_ref: xceedEventRef,
          xceed_event_uuid: xceedEventUuid,
          synced_at: nowIso,
          offer: {
            type: normalizeOfferType(booking.offer?.type ?? null),
            name: booking.offer?.name ?? null,
            description: booking.offer?.description ?? null,
          },
          booking,
          pass,
        },
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
        buyer_email_norm: buyerEmail,
        buyer_phone_norm: buyerPhone,
      });
    }
  }

  return rows;
}

function statusRank(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "checked_in") return 3;
  if (s === "active") return 2;
  if (s === "cancelled") return 1;
  return 0;
}

function dedupeRowsByEventAndQr(rows: XceedTicketRow[]) {
  const map = new Map<string, XceedTicketRow>();

  for (const row of rows) {
    const eventId = String(row.event_id || "").trim();
    const qr = String(row.qr_code || "").trim();
    if (!eventId || !qr) continue;

    const key = `${eventId}__${qr}`;
    const existing = map.get(key);
    const existingStatusRank = statusRank(existing?.status);
    const incomingStatusRank = statusRank(row?.status);

    if (incomingStatusRank > existingStatusRank) {
      map.set(key, row);
      continue;
    }

    if (existingStatusRank > incomingStatusRank) {
      continue;
    }

    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingSource = existing.raw?.source || "";
    const incomingSource = row.raw?.source || "";

    const existingOfferType = String(existing.raw?.offer?.type || "").trim();
    const incomingOfferType = String(row.raw?.offer?.type || "").trim();

    const existingHasBetterType =
      existingOfferType === "guest-list" || existingOfferType === "table" || existingOfferType === "staff";

    const incomingHasBetterType =
      incomingOfferType === "guest-list" || incomingOfferType === "table" || incomingOfferType === "staff";

    if (incomingHasBetterType && !existingHasBetterType) {
      map.set(key, row);
      continue;
    }

    if (
      incomingSource === "tickets+bookings_merge" &&
      existingSource !== "tickets+bookings_merge"
    ) {
      map.set(key, row);
      continue;
    }

    if (!existing.full_name && row.full_name) {
      map.set(key, { ...existing, ...row });
      continue;
    }

    if (!existing.email && row.email) {
      map.set(key, { ...existing, ...row });
      continue;
    }

    if (!existing.phone && row.phone) {
      map.set(key, { ...existing, ...row });
      continue;
    }
  }

  return Array.from(map.values());
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}


export async function GET(req: NextRequest) {
  console.log("=== DEBUG SUPABASE ===");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.log(
    "SERVICE_ROLE:",
    process.env.SUPABASE_SERVICE_ROLE ? "OK" : "MISSING"
  );

  const apiKey = process.env.XCEED_API_KEY;
  const baseUrl = process.env.XCEED_BASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing XCEED_API_KEY or XCEED_BASE_URL" },
      { status: 500 }
    );
  }

  if (!supabaseUrl || !supabaseServiceRole) {
    return NextResponse.json(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const xceedEventRef = String(searchParams.get("eventId") || "").trim();
  const localEventIdFromQuery = String(
    searchParams.get("localEventId") || ""
  ).trim();
  const includeCancelledTickets =
    searchParams.get("includeCancelledTickets") || "true";
  const debugQr = String(searchParams.get("qr") || "").trim();
  const mode = String(searchParams.get("mode") || "").trim().toLowerCase( );
  if (!xceedEventRef && !localEventIdFromQuery) {
    return NextResponse.json(
      { ok: false, error: "Missing required query param: eventId or localEventId" },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false },
    });

    let eventRow: any = null;
    let eventErr: any = null;

    if (localEventIdFromQuery) {
      const localTry = await supabase
        .from("events")
        .select("id, name, xceed_event_ref, xceed_event_uuid")
        .eq("id", localEventIdFromQuery)
        .maybeSingle();

      eventRow = localTry.data;
      eventErr = localTry.error;
    } else {
      const firstTry = await supabase
        .from("events")
        .select("id, name, xceed_event_ref, xceed_event_uuid")
        .eq("xceed_event_ref", xceedEventRef)
        .maybeSingle();

      eventRow = firstTry.data;
      eventErr = firstTry.error;

      if (!eventRow && !eventErr) {
        const secondTry = await supabase
          .from("events")
          .select("id, name, xceed_event_ref, xceed_event_uuid")
          .eq("xceed_event_uuid", xceedEventRef)
          .maybeSingle();

        eventRow = secondTry.data;
        eventErr = secondTry.error;
      }
    }

    if (eventErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to resolve local event",
          details: eventErr.message,
          xceedEventRef: xceedEventRef || null,
          localEventId: localEventIdFromQuery || null,
        },
        { status: 500 }
      );
    }

    if (!eventRow?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "No local event found for this Xceed identifier",
          xceedEventRef: xceedEventRef || null,
          localEventId: localEventIdFromQuery || null,
        },
        { status: 404 }
      );
    }

    const localEventId = String(eventRow.id);
    const xceedEventUuid =
      String((eventRow as any).xceed_event_uuid || "").trim() || null;
    const resolvedXceedEventRef =
      String((eventRow as any).xceed_event_ref || "").trim() ||
      xceedEventRef ||
      "";
    const xceedTicketsEventId =
      xceedEventUuid || resolvedXceedEventRef || xceedEventRef;

    const nowIso = new Date().toISOString();

if (mode === "live") {
  const ticketsFetch = await fetchAllTicketPages(
    baseUrl,
    apiKey,
    xceedTicketsEventId,
    includeCancelledTickets,
    100
  );

  if (!ticketsFetch.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: "live",
        xceedStatus: ticketsFetch.status,
        error: ticketsFetch.error || "Xceed tickets request failed",
        xceedEventRef: resolvedXceedEventRef || null,
        xceedTicketsEventId,
        localEventId,
      },
      { status: ticketsFetch.status || 502 }
    );
  }

  const ticketRows: XceedTicketRow[] = ticketsFetch.items
    .map((ticket) =>
      buildRowFromTicket({
        localEventId,
        xceedEventRef: resolvedXceedEventRef,
        xceedEventUuid,
        nowIso,
        ticket,
        bookingPassMatch: null,
      })
    )
    .filter((row): row is XceedTicketRow => !!row);

  const checkedInRows = ticketRows.filter((row) => row.status === "checked_in");

  const liveKeys = checkedInRows.map((row) =>
    buildDoorLiveKey(row.event_id, row.qr_code)
  );

  let existingLiveKeys = new Set<string>();

  if (liveKeys.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("door_live_events")
      .select("live_key")
      .eq("event_id", localEventId)
      .in("live_key", liveKeys);

    if (existingError) {
      return NextResponse.json(
        {
          ok: false,
          mode: "live",
          error: "Failed to check existing door_live_events",
          details: existingError.message,
          localEventId,
        },
        { status: 500 }
      );
    }

    existingLiveKeys = new Set(
      (existingRows || [])
        .map((r: any) => String(r.live_key || "").trim())
        .filter(Boolean)
    );
  }

  const newCheckedInRows = checkedInRows.filter((row) => {
    const liveKey = buildDoorLiveKey(row.event_id, row.qr_code);
    return !existingLiveKeys.has(liveKey);
  });

  const {
    liveEventsWritten,
    liveEventsCandidates,
    liveEventsDebug,
  } = await insertDoorLiveEvents({
    supabase,
    req,
    rows: newCheckedInRows,
  });

  return NextResponse.json({
    ok: true,
    mode: "live",
    xceedStatus: ticketsFetch.status,
    xceedEventRef: resolvedXceedEventRef || null,
    xceedTicketsEventId,
    localEventId,
    localEventName: eventRow.name ?? null,
    fetched_tickets: ticketsFetch.items.length,
    checked_in_candidates: checkedInRows.length,
    already_existing: existingLiveKeys.size,
    new_checked_in_candidates: newCheckedInRows.length,
    live_events_candidates: liveEventsCandidates,
    live_events_written: liveEventsWritten,
    live_events_debug: liveEventsDebug,
    source: "tickets_live_only",
  });
}





    const [ticketsFetch, bookingsFetch] = await Promise.all([
      fetchAllTicketPages(
        baseUrl,
        apiKey,
        xceedTicketsEventId,
        includeCancelledTickets,
        100
      ),
      fetchAllBookingPages(
        baseUrl,
        apiKey,
        xceedTicketsEventId,
        includeCancelledTickets,
        100
      ),
    ]);

    if (!ticketsFetch.ok) {
      return NextResponse.json(
        {
          ok: false,
          xceedStatus: ticketsFetch.status,
          error: ticketsFetch.error || "Xceed tickets request failed",
          xceedEventRef: resolvedXceedEventRef || null,
          xceedTicketsEventId,
          localEventId,
        },
        { status: ticketsFetch.status || 502 }
      );
    }

    if (!bookingsFetch.ok) {
      return NextResponse.json(
        {
          ok: false,
          xceedStatus: bookingsFetch.status,
          error: bookingsFetch.error || "Xceed bookings request failed",
          xceedEventRef: resolvedXceedEventRef || null,
          xceedTicketsEventId,
          localEventId,
        },
        { status: bookingsFetch.status || 502 }
      );
    }

    const bookingIndex = buildBookingPassIndex(bookingsFetch.items);

    const ticketRows: XceedTicketRow[] = ticketsFetch.items
      .map((ticket) =>
        buildRowFromTicket({
          localEventId,
          xceedEventRef: resolvedXceedEventRef,
          xceedEventUuid,
          nowIso,
          ticket,
          bookingPassMatch:
            bookingIndex.get(String(ticket.qrCode ?? "").trim()) || null,
        })
      )
      .filter((row): row is XceedTicketRow => !!row);

    const debugTicketApiMatch = debugQr
      ? ticketsFetch.items.find(
          (t) => String(t.qrCode || "").trim() === debugQr
        ) || null
      : null;

    const debugBookingMatch = debugQr
      ? bookingIndex.get(debugQr) || null
      : null;

    const debugBuiltRow = debugQr
      ? ticketRows.find((r) => String(r.qr_code || "").trim() === debugQr) || null
      : null;

    const existingQrs = new Set(ticketRows.map((r) => r.qr_code));

    const bookingOnlyRows = buildRowsFromBookingsOnly({
      localEventId,
      xceedEventRef: resolvedXceedEventRef,
      xceedEventUuid,
      nowIso,
      bookings: bookingsFetch.items,
      skipQrs: existingQrs,
    });

    const mergedRows = [...ticketRows, ...bookingOnlyRows];
    const rows = dedupeRowsByEventAndQr(mergedRows);

    const debugDedupedRow = debugQr
      ? rows.find((r) => String(r.qr_code || "").trim() === debugQr) || null
      : null;

    if (rows.length === 0) {
      const { count: totalRowsAfterSync, error: countErr } = await supabase
        .from("xceed_tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", localEventId);

      if (countErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "Supabase count failed on xceed_tickets after sync",
            details: countErr.message,
            xceedEventRef: resolvedXceedEventRef || null,
            xceedTicketsEventId,
            localEventId,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        xceedStatus: ticketsFetch.status,
        xceedEventRef: resolvedXceedEventRef || null,
        xceedTicketsEventId,
        localEventId,
        localEventName: eventRow.name ?? null,
        fetched_tickets: ticketsFetch.items.length,
        fetched_bookings: bookingsFetch.items.length,
        merged_rows: mergedRows.length,
        deduped_rows: 0,
        duplicates_removed: mergedRows.length,
        upserted: 0,
        live_events_candidates: 0,
        live_events_written: 0,
        live_events_debug: [],
        total_rows_after_sync: Number(totalRowsAfterSync || 0),
        source: "tickets+bookings_merge",
        message: "No tickets returned by Xceed",
        preview: [],
      });
    }

const rowChunks = chunkArray(rows, 200);
let upsertedCount = 0;

for (const chunk of rowChunks) {
  const { error: upsertError } = await supabase
    .from("xceed_tickets")
    .upsert(chunk, {
      onConflict: "event_id,qr_code",
    });

  if (upsertError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase upsert failed on xceed_tickets",
        details: upsertError.message,
        xceedEventRef: resolvedXceedEventRef || null,
        xceedTicketsEventId,
        localEventId,
        source: "tickets+bookings_merge",
        failed_chunk_size: chunk.length,
      },
      { status: 500 }
    );
  }

  upsertedCount += chunk.length;
}

const debugUpsertedRow = debugQr
  ? rows.find((r) => String(r.qr_code || "").trim() === debugQr) || null
  : null;

const {
  liveEventsWritten,
  liveEventsCandidates,
  liveEventsDebug,
} = await insertDoorLiveEvents({
  supabase,
  req,
  rows: rows,
});

    const { count: totalRowsAfterSync, error: countErr } = await supabase
      .from("xceed_tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", localEventId);

    if (countErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase count failed on xceed_tickets after sync",
          details: countErr.message,
          xceedEventRef: resolvedXceedEventRef || null,
          xceedTicketsEventId,
          localEventId,
          source: "tickets+bookings_merge",
        },
        { status: 500 }
      );
    }

    const preview =
      rows.slice(0, 5).map((r: any) => ({
        qr_code: r.qr_code,
        status: r.status,
        full_name: r.full_name,
        email: r.email,
        booking_date: r.booking_date,
        transaction_id: r.transaction_id,
        offer_type: r.raw?.offer?.type ?? null,
        offer_name: r.raw?.offer?.name ?? null,
        source: r.raw?.source ?? null,
      })) ?? [];

    return NextResponse.json({
      ok: true,
      xceedStatus: ticketsFetch.status,
      xceedEventRef: resolvedXceedEventRef || null,
      xceedTicketsEventId,
      localEventId,
      localEventName: eventRow.name ?? null,
      fetched_tickets: ticketsFetch.items.length,
      fetched_bookings: bookingsFetch.items.length,
      merged_rows: mergedRows.length,
      deduped_rows: rows.length,
      duplicates_removed: mergedRows.length - rows.length,
      upserted: upsertedCount,
      live_events_candidates: liveEventsCandidates,
      live_events_written: liveEventsWritten,
      live_events_debug: liveEventsDebug,
      total_rows_after_sync: Number(totalRowsAfterSync || 0),
      source: "tickets+bookings_merge",
      preview,
      debug_qr: debugQr || null,


      debug_trace: debugQr
        ? {
            api_ticket_match: debugTicketApiMatch
              ? {
                  qrCode: debugTicketApiMatch.qrCode ?? null,
                  hasCheckedIn: debugTicketApiMatch.hasCheckedIn ?? null,
                  checkedInTime: debugTicketApiMatch.checkedInTime ?? null,
                  isActive: debugTicketApiMatch.isActive ?? null,
                  firstName: debugTicketApiMatch.firstName ?? null,
                  lastName: debugTicketApiMatch.lastName ?? null,
                  email: debugTicketApiMatch.email ?? null,
                }
              : null,
            booking_pass_match: debugBookingMatch
              ? {
                  passQr: debugBookingMatch.pass?.qrCode ?? null,
                  passCheckedIn: debugBookingMatch.pass?.hasCheckedIn ?? null,
                  passCheckedInTime: debugBookingMatch.pass?.checkedInTime ?? null,
                  buyerEmail: debugBookingMatch.booking?.buyer?.email ?? null,
                  bookingId: debugBookingMatch.booking?.id ?? null,
                }
              : null,
            built_row: debugBuiltRow
              ? {
                  qr_code: debugBuiltRow.qr_code,
                  status: debugBuiltRow.status,
                  full_name: debugBuiltRow.full_name,
                  email: debugBuiltRow.email,
                  source: debugBuiltRow.raw?.source ?? null,
                }
              : null,
            deduped_row: debugDedupedRow
              ? {
                  qr_code: debugDedupedRow.qr_code,
                  status: debugDedupedRow.status,
                  full_name: debugDedupedRow.full_name,
                  email: debugDedupedRow.email,
                  source: debugDedupedRow.raw?.source ?? null,
                }
              : null,
            upserted_row: debugUpsertedRow
              ? {
                  qr_code: debugUpsertedRow.qr_code,
                  status: debugUpsertedRow.status,
                  full_name: debugUpsertedRow.full_name,
                  email: debugUpsertedRow.email,
                  source: debugUpsertedRow.raw?.source ?? null,
                }
              : null,
          }
        : null,
      });
} catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}