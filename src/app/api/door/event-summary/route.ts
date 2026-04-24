import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketType =
  | "ticket"
  | "guest"
  | "table"
  | "drink"
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

  if (combined.includes("drink")) {
    return "drink";
  }

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

function isRealDoorCheckin(row: any): boolean {
  const liveKey = String(row?.live_key || "");
  const payload = row?.payload_json || {};

  return (
    liveKey.includes("__checked_in") ||
    payload?.ticket?.checked_in === true ||
    norm(payload?.ticket?.status) === "checked_in"
  );
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
  let allRows: any[] = [];

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
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) break;

    from += pageSize;
  }

  return allRows;
}

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId");

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

const liveEvents = await fetchAllRows(
  supabase,
  "door_live_events",
  "id,event_id,live_key,ticket_qr_code,payload_json,created_at",
  eventId,
  "created_at"
);






    const typeSummary = emptyTypeSummary();
    const qrToType = new Map<string, TicketType>();

    for (const ticket of tickets || []) {
      const qr = normalizeQr(ticket?.qr_code || ticket?.raw?.qrCode || ticket?.raw?.ticket?.qrCode || ticket?.raw?.pass?.qrCode);
      const type = classifyTicket(ticket);

      typeSummary[type].total += 1;

      if (qr) {
        qrToType.set(qr, type);
      }
    }

    const enteredQr = new Set<string>();

    for (const live of liveEvents || []) {
      if (!isRealDoorCheckin(live)) continue;

      const qr = getLiveQr(live);
      if (!qr) continue;

      enteredQr.add(qr);
    }


for (const qr of enteredQr) {
  const matchedTicketType = qrToType.get(qr);

  if (matchedTicketType) {
    typeSummary[matchedTicketType].in += 1;
    continue;
  }

  const live = (liveEvents || []).find((row) => getLiveQr(row) === qr);
  const fallbackType = classifyLivePayload(live?.payload_json || {});

  typeSummary[fallbackType].in += 1;
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
    const enteredTickets = enteredQr.size;
    const missingTickets = Math.max(0, totalTickets - enteredTickets);

    return NextResponse.json({
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
    });
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