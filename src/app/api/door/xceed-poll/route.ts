import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveDoorGateByXceedEmail } from "@/lib/door/resolve-door-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const POLL_INTERVAL_MS = 5_000;
const LEASE_DURATION_MS = 15_000;
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

async function fetchXceedTickets(params: {
  baseUrl: string;
  apiKey: string;
  xceedEventId: string;
}) {
  const tickets: XceedTicket[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const url = new URL("/v1/tickets", params.baseUrl);

    url.searchParams.set("offset", String(offset));
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
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntilIso = new Date(now.getTime() + LEASE_DURATION_MS).toISOString();
  const pollThresholdIso = new Date(now.getTime() - POLL_INTERVAL_MS).toISOString();
  let eventId = "";
  let leaseAcquired = false;
  let supabase: any = null;

  try {
    supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const body = await req.json().catch(() => ({}));
    eventId = normalize(body?.event_id);

    if (!eventId) {
      return json({ ok: false, error: "Missing event_id" }, 400);
    }

    const { data: pollState, error: leaseError } = await supabase
      .from("xceed_poll_state")
      .update({
        lease_until: leaseUntilIso,
        last_polled_at: nowIso,
        updated_at: nowIso,
      })
      .eq("event_id", eventId)
      .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
      .or(`last_polled_at.is.null,last_polled_at.lt.${pollThresholdIso}`)
      .select("event_id,last_checked_in_time")
      .maybeSingle();

    if (leaseError) {
      throw leaseError;
    }

    if (!pollState) {
      return json({
        ok: true,
        polled: false,
        reason: "lease_or_interval",
      });
    }

    leaseAcquired = true;

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,xceed_event_uuid,xceed_event_ref")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      throw eventError;
    }

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

    const checkpoint = Number(pollState.last_checked_in_time || 0);
    const newScans = tickets
      .filter(
        (ticket) =>
          ticket.hasCheckedIn === true &&
          Number(ticket.checkedInTime || 0) > checkpoint &&
          Boolean(normalize(ticket.qrCode))
      )
      .sort(
        (left, right) =>
          Number(left.checkedInTime || 0) - Number(right.checkedInTime || 0)
      );

    let processed = 0;
    let latestProcessedTime = checkpoint;

    for (const ticket of newScans) {
      const qrCode = normalize(ticket.qrCode);
      const checkedInTime = Number(ticket.checkedInTime || 0);
      const checkedInBy = normalize(ticket.checkedInBy).toLowerCase();
      const gate = await resolveDoorGateByXceedEmail(supabase, checkedInBy);

      if (!gate.gate_id || !gate.door_role) {
        throw new Error(
          `No active gate configured for Xceed email: ${checkedInBy || "missing"}`
        );
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

      if (ticketUpdateError) {
        throw ticketUpdateError;
      }

      const fastResponse = await fetch(
        new URL("/api/door/fast-check", req.nextUrl.origin),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            code: qrCode,
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

      const liveKey = `${eventId}__${qrCode}__${checkedInTime}`;
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

      if (liveError) {
        throw liveError;
      }

      processed += 1;
      latestProcessedTime = checkedInTime;
    }

    const completedAt = new Date().toISOString();
    const { error: stateUpdateError } = await supabase
      .from("xceed_poll_state")
      .update({
        last_success_at: completedAt,
        last_checked_in_time: latestProcessedTime || null,
        lease_until: null,
        last_error: null,
        updated_at: completedAt,
      })
      .eq("event_id", eventId);

    if (stateUpdateError) {
      throw stateUpdateError;
    }

    leaseAcquired = false;

    return json({
      ok: true,
      polled: true,
      fetched: tickets.length,
      candidates: newScans.length,
      processed,
      checkpoint: latestProcessedTime || null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : JSON.stringify(error) || "Unknown error";

    if (eventId && leaseAcquired && supabase) {
      await supabase
        .from("xceed_poll_state")
        .update({
          lease_until: null,
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
    }

    return json({ ok: false, error: message }, 500);
  }
}
