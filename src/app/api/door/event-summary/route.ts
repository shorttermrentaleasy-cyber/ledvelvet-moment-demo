import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketType =
  | "ticket"
  | "guest"
  | "table"
  | "drink"
  | "penalty"
  | "cancelled"
  | "unknown";

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
  const raw = row?.raw || {};
  const offerType = readOfferType(raw);
  const offerName = readOfferName(raw);
  const combined = `${offerType} ${offerName}`;

  if (combined.includes("penale")) return "penalty";
  if (isCancelledTicket(row)) return "cancelled";

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

function emptyTypeSummary(): Record<TicketType, TypeCounter> {
  return {
    ticket: { total: 0, in: 0, out: 0 },
    guest: { total: 0, in: 0, out: 0 },
    table: { total: 0, in: 0, out: 0 },
    drink: { total: 0, in: 0, out: 0 },
    penalty: { total: 0, in: 0, out: 0 },
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

      if (isEntered) {
        typeSummary[type].in += 1;
      }
    }

    for (const key of Object.keys(typeSummary) as TicketType[]) {
      typeSummary[key].out = Math.max(
        0,
        typeSummary[key].total - typeSummary[key].in
      );
    }

    const totalTickets = tickets.length;

    const enteredTickets =
      typeSummary.ticket.in +
      typeSummary.guest.in +
      typeSummary.table.in +
      typeSummary.drink.in +
      typeSummary.penalty.in +
      typeSummary.cancelled.in +
      typeSummary.unknown.in;

    const missingTickets = Math.max(0, totalTickets - enteredTickets);
const peopleTotal = typeSummary.ticket.total + typeSummary.guest.total;
const peopleIn = typeSummary.ticket.in + typeSummary.guest.in;
const peopleMissing = Math.max(0, peopleTotal - peopleIn);

const nonPeopleScans =
  typeSummary.table.in +
  typeSummary.drink.in +
  typeSummary.penalty.in +
  typeSummary.cancelled.in +
  typeSummary.unknown.in;

    const response: any = {
      ok: true,
      event_id: eventId,

      total_tickets: totalTickets,
      entered_tickets: enteredTickets,
      missing_tickets: missingTickets,
people_total: peopleTotal,
people_in: peopleIn,
people_missing: peopleMissing,
non_people_scans: nonPeopleScans,
      ticket_count: typeSummary.ticket.total,
      guest_count: typeSummary.guest.total,
      table_count: typeSummary.table.total,
      cancelled_count: typeSummary.cancelled.total,
      drink_count: typeSummary.drink.total,
      penalty_count: typeSummary.penalty.total,

      type_summary: typeSummary,
    };

    if (debugMode) {
      response.debug = {
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        now: new Date().toISOString(),
        counted_from: "xceed_tickets.status",
        tickets_rows: tickets.length,
        status_checked_in: enteredTickets,
        penalty_total: typeSummary.penalty.total,
        penalty_in: typeSummary.penalty.in,
people_total: peopleTotal,
people_in: peopleIn,
people_missing: peopleMissing,
non_people_scans: nonPeopleScans,
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