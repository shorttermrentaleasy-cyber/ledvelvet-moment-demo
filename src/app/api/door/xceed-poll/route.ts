import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveDoorGateByXceedEmail } from "@/lib/door/resolve-door-gate";

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

    tickets.push(...payload.data);

    if (payload.data.length < PAGE_SIZE) {
      return tickets;
    }
  }

  throw new Error("Xceed tickets pagination exceeded the safety limit");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventId = normalize(body?.event_id);

    if (!eventId) {
      return json({ ok: false, error: "Missing event_id" }, 400);
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

    const liveKeys = checkedInTickets.map((ticket) =>
      buildLiveKey(eventId, ticket)
    );
    const existingLiveKeys = new Set<string>();

    for (const keyChunk of chunks(liveKeys, 100)) {
      const { data: existing, error: existingError } = await supabase
        .from("door_live_events")
        .select("live_key")
        .eq("event_id", eventId)
        .in("live_key", keyChunk);

      if (existingError) throw existingError;

      for (const row of existing || []) {
        if (row.live_key) existingLiveKeys.add(String(row.live_key));
      }
    }

    const newScans = checkedInTickets.filter(
      (ticket) => !existingLiveKeys.has(buildLiveKey(eventId, ticket))
    );
    let processed = 0;
    let skippedUnmapped = 0;

    for (const ticket of newScans) {
      const qrCode = normalize(ticket.qrCode);
      const checkedInTime = Number(ticket.checkedInTime || 0);
      const checkedInBy = normalize(ticket.checkedInBy).toLowerCase();
      const gate = await resolveDoorGateByXceedEmail(supabase, checkedInBy);

      if (!gate.gate_id || !gate.door_role) {
        skippedUnmapped += 1;
        continue;
      }

      const { error: ticketUpdateError } = await supabase
        .from("xceed_tickets")
        .update({
          status: "checked_in",
          raw: ticket,
          imported_at: new Date().toISOString(),
        })
        .eq("event_id", eventId)
        .eq("qr_code", qrCode);

      if (ticketUpdateError) throw ticketUpdateError;

      const fastResponse = await fetch(
        "https://www.ledvelvet.it/api/door/fast-check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            code: qrCode,
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

    return json({
      ok: true,
      fetched: tickets.length,
      checked_in: checkedInTickets.length,
      candidates: newScans.length,
      processed,
      skipped_unmapped: skippedUnmapped,
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
