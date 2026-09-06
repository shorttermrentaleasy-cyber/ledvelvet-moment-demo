import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveDoorGateByXceedEmail } from "@/lib/door/resolve-door-gate";
import {
  createFastCheckAccessToken,
  fastCheckAccessHeader,
  readFastCheckAccessToken,
  verifyFastCheckAccessToken,
} from "@/lib/door/fast-check-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type XceedTicket = {
  qrCode?: string | null;
  hasCheckedIn?: boolean | null;
  checkedInTime?: number | null;
  checkedInBy?: string | null;
  [key: string]: unknown;
};

type XceedRecord = Record<string, any>;

type FastResponse = {
  ok: boolean;
  decision?: string;
  message?: string;
  [key: string]: unknown;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

function normalize(value: unknown): string {
  return String(value || "").trim();
}

function normalizeCheckedInTime(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : numeric;
  }

  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function normalizeXceedTicket(ticket: XceedTicket): XceedTicket {
  const raw = ticket as XceedRecord;
  const pass = raw?.pass || raw?.ticket?.pass || raw?.booking?.passes?.[0] || {};
  const nestedTicket = raw?.ticket || {};

  return {
    ...ticket,
    qrCode:
      raw?.qrCode ||
      raw?.qr_code ||
      raw?.["QR Code"] ||
      pass?.qrCode ||
      pass?.qr_code ||
      nestedTicket?.qrCode ||
      nestedTicket?.qr_code ||
      null,
    hasCheckedIn:
      raw?.hasCheckedIn ??
      pass?.hasCheckedIn ??
      nestedTicket?.hasCheckedIn ??
      false,
    checkedInTime: normalizeCheckedInTime(
      raw?.checkedInTime ??
        raw?.checkedInAt ??
        pass?.checkedInTime ??
        pass?.checkedInAt ??
        nestedTicket?.checkedInTime ??
        nestedTicket?.checkedInAt
    ),
    checkedInBy:
      raw?.checkedInBy ??
      pass?.checkedInBy ??
      nestedTicket?.checkedInBy ??
      null,
  };
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function buildLiveKey(eventId: string, ticket: XceedTicket) {
  return `${eventId}__${normalize(ticket.qrCode)}__${Number(
    ticket.checkedInTime || 0
  )}`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

async function fetchXceedTickets(params: {
  baseUrl: string;
  apiKey: string;
  xceedEventId: string;
}) {
  const tickets: XceedTicket[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL("/v1/tickets", params.baseUrl);

    url.searchParams.set("offset", String(page * PAGE_SIZE));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("events", params.xceedEventId);
    url.searchParams.set("includeCancelledTickets", "true");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": params.apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(`Xceed tickets request failed (${response.status})`);
    }

    tickets.push(...payload.data.map((ticket: XceedTicket) => normalizeXceedTicket(ticket)));

    if (payload.data.length < PAGE_SIZE) {
      return tickets;
    }
  }

  throw new Error("Xceed tickets pagination exceeded the safety limit");
}

export async function POST(req: NextRequest) {
  try {
    const access = verifyFastCheckAccessToken(
      readFastCheckAccessToken(req)
    );
    if (!access) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const eventId = normalize(body?.event_id);

    if (!eventId) {
      return json({ ok: false, error: "Missing event_id" }, 400);
    }

    if (access.event_id !== eventId) {
      return json({ ok: false, error: "AccessDenied" }, 403);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    }

    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        requiredEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,xceed_event_uuid,xceed_event_ref")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw eventError;

    const xceedEventId =
      normalize(event?.xceed_event_uuid) || normalize(event?.xceed_event_ref);

    if (!event || !xceedEventId) {
      throw new Error("Event has no Xceed identifier");
    }

    const tickets = await fetchXceedTickets({
      baseUrl: requiredEnv("XCEED_BASE_URL"),
      apiKey: requiredEnv("XCEED_API_KEY"),
      xceedEventId,
    });
    const checkedInTickets = tickets
      .filter(
        (ticket) =>
          ticket.hasCheckedIn === true &&
          Number(ticket.checkedInTime || 0) > 0 &&
          Boolean(normalize(ticket.qrCode))
      )
      .sort(
        (left, right) =>
          Number(left.checkedInTime || 0) - Number(right.checkedInTime || 0)
      );
    const checkedInWithoutTime = tickets.filter(
      (ticket) => ticket.hasCheckedIn === true && Number(ticket.checkedInTime || 0) <= 0
    ).length;
    const checkedInWithoutQr = tickets.filter(
      (ticket) =>
        ticket.hasCheckedIn === true &&
        Number(ticket.checkedInTime || 0) > 0 &&
        !normalize(ticket.qrCode)
    ).length;

    const liveKeys = checkedInTickets.map((ticket) =>
      buildLiveKey(eventId, ticket)
    );
    const existingLiveKeys = new Set<string>();
    const existingLiveEvents = new Map<
      string,
      { result: string | null; gate_id: string | null; door_role: string | null; created_at: string | null }
    >();

    for (const keyChunk of chunks(liveKeys, 100)) {
      const { data: existing, error: existingError } = await supabase
        .from("door_live_events")
        .select("live_key,result,gate_id,door_role,created_at")
        .eq("event_id", eventId)
        .in("live_key", keyChunk);

      if (existingError) throw existingError;

      for (const row of existing || []) {
        const retryable = ["NO_TICKET", "DB_ERROR", "FATAL_ERROR"].includes(
          String(row.result || "")
        );
        if (row.live_key && !retryable) {
          const liveKey = String(row.live_key);
          existingLiveKeys.add(liveKey);
          existingLiveEvents.set(liveKey, {
            result: row.result ? String(row.result) : null,
            gate_id: row.gate_id ? String(row.gate_id) : null,
            door_role: row.door_role ? String(row.door_role) : null,
            created_at: row.created_at ? String(row.created_at) : null,
          });
        }
      }
    }

    const newScans = checkedInTickets.filter(
      (ticket) => !existingLiveKeys.has(buildLiveKey(eventId, ticket))
    );
    let processed = 0;
    let skippedUnmapped = 0;
    const unmappedScanners = new Set<string>();

    for (const ticket of newScans) {
      const qrCode = normalize(ticket.qrCode);
      const checkedInTime = Number(ticket.checkedInTime || 0);
      const checkedInBy = normalize(ticket.checkedInBy).toLowerCase();
      const gate = await resolveDoorGateByXceedEmail(
        supabase,
        checkedInBy,
        eventId,
        access.gate_id
      );

      if (!gate.gate_id || !gate.door_role) {
        skippedUnmapped += 1;
        unmappedScanners.add(checkedInBy || "email scanner assente");
        continue;
      }

      const { error: ticketUpdateError } = await supabase
        .from("xceed_tickets")
        .upsert({
          event_id: eventId,
          qr_code: qrCode,
          status: "checked_in",
          raw: ticket,
          imported_at: new Date().toISOString(),
        }, {
          onConflict: "event_id,qr_code",
        });

      if (ticketUpdateError) throw ticketUpdateError;

      const internalToken = createFastCheckAccessToken({
        eventId,
        gateId: gate.gate_id,
        gateRole: gate.door_role,
        expiresAt: Math.floor(Date.now() / 1000) + 5 * 60,
      });
      const internalHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...fastCheckAccessHeader(internalToken),
      };
      const previewCookie = req.headers.get("cookie");
      if (previewCookie) {
        internalHeaders.Cookie = previewCookie;
      }
      const fastResponse = await fetch(
        new URL("/api/door/fast-check", req.nextUrl.origin),
        {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            event_id: eventId,
            code: qrCode,
            gate_id: gate.gate_id,
            gate_role: gate.door_role,
          }),
          cache: "no-store",
        }
      );
      const fastPayload = (await fastResponse.json().catch(() => null)) as
        | FastResponse
        | null;

      if (!fastResponse.ok || !fastPayload?.decision) {
        throw new Error("Fast Check evaluation failed");
      }

      const liveKey = buildLiveKey(eventId, ticket);
      const { error: liveError } = await supabase
        .from("door_live_events")
        .upsert(
          {
            event_id: eventId,
            gate_id: gate.gate_id,
            door_role: gate.door_role,
            device_label: gate.gate_name,
            live_key: liveKey,
            ticket_qr_code: qrCode,
            result: fastPayload.decision,
            payload_json: {
              ...fastPayload,
              checked_in_time: checkedInTime,
              checked_in_by: checkedInBy,
              gate_id: gate.gate_id,
              door_role: gate.door_role,
              gate_name: gate.gate_name,
            },
            created_at: new Date(checkedInTime * 1000).toISOString(),
          },
          { onConflict: "live_key" }
        );

      if (liveError) throw liveError;

      processed += 1;
    }

    const latestXceedTicket = checkedInTickets.at(-1) || null;
    const latestXceedLiveKey = latestXceedTicket
      ? buildLiveKey(eventId, latestXceedTicket)
      : null;
    const latestStoredEvent = latestXceedLiveKey
      ? existingLiveEvents.get(latestXceedLiveKey) || null
      : null;

    return json({
      ok: true,
      fetched: tickets.length,
      checked_in: checkedInTickets.length,
      checked_in_without_time: checkedInWithoutTime,
      checked_in_without_qr: checkedInWithoutQr,
      candidates: newScans.length,
      processed,
      skipped_unmapped: skippedUnmapped,
      unmapped_scanners: Array.from(unmappedScanners),
      latest_xceed_scan: latestXceedTicket
        ? {
            checked_in_time: Number(latestXceedTicket.checkedInTime || 0),
            checked_in_by: normalize(latestXceedTicket.checkedInBy).toLowerCase() || null,
            qr_suffix: normalize(latestXceedTicket.qrCode).slice(-8) || null,
            already_stored: Boolean(latestStoredEvent),
            stored_event: latestStoredEvent,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : JSON.stringify(error) || "Unknown error";

    return json({ ok: false, error: message }, 500);
  }
}
