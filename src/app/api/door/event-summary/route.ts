import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketType = "ticket" | "guest" | "table" | "drink" | "cancelled" | "unknown";

type TypeCounter = {
  total: number;
  in: number;
  out: number;
};

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getSupabase() {
  const url = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!serviceRole) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE");
  }

return createClient(url, serviceRole, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);

      headers.set("Cache-Control", "no-store");
      headers.set("Pragma", "no-cache");

      return fetch(input, {
        ...init,
        cache: "no-store",
        headers,
      });
    },
  },
});


}

function norm(v: unknown): string {
  return String(v || "").trim().toLowerCase();
}

function normalizeQr(v: unknown): string {
  return String(v || "").trim();
}

function readOfferType(raw: any): string {
  return norm(
    raw?.offer?.type ||
      raw?.ticket?.offer?.type ||
      raw?.booking?.offer?.type ||
      ""
  );
}

function readOfferName(raw: any): string {
  return norm(
    raw?.offer?.name ||
      raw?.ticket?.offer?.name ||
      raw?.booking?.offer?.name ||
      ""
  );
}

function isCancelledTicket(row: any): boolean {
  const status = norm(row?.status);
  const raw = row?.raw || {};

  const rawStatus = norm(
    raw?.status ||
      raw?.ticket?.status ||
      raw?.pass?.status ||
      raw?.booking?.status ||
      ""
  );

  const isActive =
    raw?.isActive ??
    raw?.ticket?.isActive ??
    raw?.pass?.isActive ??
    null;

  return (
    status === "cancelled" ||
    status === "canceled" ||
    rawStatus === "cancelled" ||
    rawStatus === "canceled" ||
    isActive === false
  );
}

function classifyTicket(row: any): TicketType {
  if (isCancelledTicket(row)) return "cancelled";

  const raw = row?.raw || {};
  const offerType = readOfferType(raw);
  const offerName = readOfferName(raw);
  const combined = `${offerType} ${offerName}`;

  if (
    combined.includes("guest") ||
    combined.includes("guest-list") ||
    combined.includes("guest list") ||
    combined.includes("guestlist")
  ) {
    return "guest";
  }

  if (
    combined.includes("table") ||
    combined.includes("bottle") ||
    combined.includes("bottle-service") ||
    combined.includes("bottle service")
  ) {
    return "table";
  }

  if (combined.includes("drink")) return "drink";

  if (
    combined.includes("ticket") ||
    combined.includes("general") ||
    combined.includes("early") ||
    combined.includes("entry") ||
    combined.includes("ingresso") ||
    combined === ""
  ) {
    return "ticket";
  }

  return "unknown";
}

function classifyLivePayload(payload: any): TicketType {
  const offerType = norm(payload?.ticket?.offer_type);
  const offerName = norm(payload?.ticket?.offer_name);
  const status = norm(payload?.ticket?.status);
  const combined = `${offerType} ${offerName}`;

  if (status === "cancelled" || status === "canceled") return "cancelled";

  if (
    combined.includes("guest") ||
    combined.includes("guest-list") ||
    combined.includes("guest list") ||
    combined.includes("guestlist")
  ) {
    return "guest";
  }

  if (
    combined.includes("table") ||
    combined.includes("bottle") ||
    combined.includes("bottle-service") ||
    combined.includes("bottle service")
  ) {
    return "table";
  }

  if (combined.includes("drink")) return "drink";

  if (
    combined.includes("ticket") ||
    combined.includes("general") ||
    combined.includes("early") ||
    combined.includes("entry") ||
    combined.includes("ingresso") ||
    combined.trim() === ""
  ) {
    return "ticket";
  }

  return "unknown";
}

function getLiveQr(row: any): string {
  const payload = row?.payload_json || {};

  return normalizeQr(
    row?.ticket_qr_code ||
      payload?.ticket?.qr_code ||
      payload?.ticket?.qrCode ||
      payload?.qr_code ||
      payload?.qrCode ||
      ""
  );
}

function emptyTypeSummary(): Record<TicketType, TypeCounter> {
  return {
    ticket: { total: 0, in: 0, out: 0 },
    guest: { total: 0, in: 0, out: 0 },
    table: { total: 0, in: 0, out: 0 },
    drink: { total: 0, in: 0, out: 0 },
    cancelled: { total: 0, in: 0, out: 0 },
    unknown: { total: 0, in: 0, out: 0 },
  };
}

async function fetchAllRows(
  supabase: any,
  table: string,
  select: string,
  eventId: string,
  orderBy?: string
) {
  const pageSize = 1000;
  let from = 0;
  const allRows: any[] = [];

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .eq("event_id", eventId)
      .range(from, from + pageSize - 1);

    if (orderBy) {
      query = query.order(orderBy, { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

/**
 * Lettura live events robusta:
 * - prima per colonna event_id
 * - poi anche per live_key prefissata con eventId
 * - merge per id
 *
 * Questo evita il caso in cui PostgREST/Supabase non restituisce tutte le righe
 * con il solo filtro event_id, pur essendo visibili in SQL.
 */
async function fetchAllLiveEventsForEvent(supabase: any, eventId: string) {
  const select = "id,event_id,live_key,ticket_qr_code,payload_json,created_at";

  const byEventId = await fetchAllRows(
    supabase,
    "door_live_events",
    select,
    eventId,
    "created_at"
  );

  const { data: byLiveKey, error: liveKeyError } = await supabase
    .from("door_live_events")
    .select(select)
    .ilike("live_key", `${eventId}__%`)
    .order("created_at", { ascending: false })
    .range(0, 9999);

  if (liveKeyError) throw liveKeyError;

  const merged = new Map<string, any>();

  for (const row of byEventId || []) {
    if (row?.id) merged.set(row.id, row);
  }

  for (const row of byLiveKey || []) {
    if (row?.id) merged.set(row.id, row);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const da = new Date(a?.created_at || 0).getTime();
    const db = new Date(b?.created_at || 0).getTime();
    return db - da;
  });
}

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId")?.trim();
    const debugMode = true;

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Missing eventId" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const tickets = await fetchAllRows(
      supabase,
      "xceed_tickets",
      "id,event_id,qr_code,status,raw",
      eventId
    );

    const typeSummary = emptyTypeSummary();

    for (const ticket of tickets || []) {
      const type = classifyTicket(ticket);
      const status = norm(ticket?.status);
      const isEntered = status === "checked_in";

      typeSummary[type].total += 1;

      if (isEntered && type !== "cancelled") {
        typeSummary[type].in += 1;
      }
    }


    for (const key of Object.keys(typeSummary) as TicketType[]) {
      if (key === "cancelled") {
        typeSummary[key].out = 0;
      } else {
        typeSummary[key].out = Math.max(
          0,
          typeSummary[key].total - typeSummary[key].in
        );
      }
    }


    const totalTickets = (tickets || []).length;
    const enteredTickets =
      typeSummary.ticket.in +
      typeSummary.guest.in +
      typeSummary.table.in +
      typeSummary.drink.in +
      typeSummary.unknown.in;

    const missingTickets = Math.max(0, totalTickets - enteredTickets);


    const response: any = {
      ok: true,
      event_id: eventId,

      total_tickets: totalTickets,
      entered_tickets: enteredTickets,
      missing_tickets: missingTickets,

      ticket_count: typeSummary.ticket.total,
      guest_count: typeSummary.guest.total,
      table_count: typeSummary.table.total,
      cancelled_count: typeSummary.cancelled.total,
      drink_count: typeSummary.drink.total,

      type_summary: typeSummary,
    };

if (debugMode) {
  response.debug = {
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    now: new Date().toISOString(),
    counted_from: "xceed_tickets.status",
    tickets_rows: tickets.length,
    status_checked_in: enteredTickets,
  };
}


    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}