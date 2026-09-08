import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email));
}

async function fetchXceedPages(path: "tickets" | "bookings", eventId: string) {
  const rows: any[] = [];
  const baseUrl = requiredEnv("XCEED_BASE_URL");
  const apiKey = requiredEnv("XCEED_API_KEY");

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`/v1/${path}`, baseUrl);
    url.searchParams.set("offset", String(page * PAGE_SIZE));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("events", eventId);
    url.searchParams.set("includeCancelledTickets", "true");

    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(`Xceed ${path} request failed (${response.status})`);
    }

    rows.push(...payload.data);
    if (payload.data.length < PAGE_SIZE) return rows;
  }

  throw new Error(`Xceed ${path} pagination exceeded the safety limit`);
}

function ticketStatus(ticket: any, pass?: any) {
  if (ticket?.isActive === false || pass?.isActive === false) return "cancelled";
  if (
    ticket?.hasCheckedIn === true ||
    pass?.hasCheckedIn === true ||
    Number(ticket?.checkedInTime || pass?.checkedInTime || 0) > 0
  ) return "checked_in";
  return "active";
}

function buildRows(params: {
  eventId: string;
  xceedEventId: string;
  tickets: any[];
  bookings: any[];
}) {
  const { eventId, xceedEventId, tickets, bookings } = params;
  const now = new Date().toISOString();
  const bookingPassByQr = new Map<string, { booking: any; pass: any }>();

  for (const booking of bookings) {
    for (const pass of Array.isArray(booking?.passes) ? booking.passes : []) {
      const qr = String(pass?.qrCode || "").trim();
      if (qr) bookingPassByQr.set(qr, { booking, pass });
    }
  }

  const rows = new Map<string, any>();
  for (const ticket of tickets) {
    const qr = String(ticket?.qrCode || "").trim();
    if (!qr) continue;
    const match = bookingPassByQr.get(qr);
    rows.set(qr, {
      event_id: eventId,
      qr_code: qr,
      status: ticketStatus(ticket, match?.pass),
      imported_at: now,
      raw: {
        source: match ? "analytics_tickets+bookings" : "analytics_tickets",
        xceed_event_ref: xceedEventId,
        synced_at: now,
        offer: match?.booking?.offer || ticket?.offer || null,
        booking: match?.booking || ticket?.booking || null,
        ticket,
        pass: match?.pass || ticket?.pass || null,
      },
    });
  }

  for (const [qr, match] of bookingPassByQr.entries()) {
    if (rows.has(qr)) continue;
    rows.set(qr, {
      event_id: eventId,
      qr_code: qr,
      status: ticketStatus(null, match.pass),
      imported_at: now,
      raw: {
        source: "analytics_bookings_only",
        xceed_event_ref: xceedEventId,
        synced_at: now,
        offer: match.booking?.offer || null,
        booking: match.booking,
        ticket: null,
        pass: match.pass,
      },
    });
  }

  return Array.from(rows.values());
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const eventId = String(body?.event_id || "").trim();
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "event_id obbligatorio" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      process.env.SUPABASE_SERVICE_ROLE_KEY || requiredEnv("SUPABASE_SERVICE_ROLE"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,xceed_event_uuid,xceed_event_ref")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) throw new Error("Evento non trovato");

    const xceedEventId = String(event.xceed_event_uuid || event.xceed_event_ref || "").trim();
    if (!xceedEventId) throw new Error("Evento senza collegamento Xceed");

    const [tickets, bookings] = await Promise.all([
      fetchXceedPages("tickets", xceedEventId),
      fetchXceedPages("bookings", xceedEventId),
    ]);
    const rows = buildRows({ eventId, xceedEventId, tickets, bookings });

    for (let index = 0; index < rows.length; index += 200) {
      const { error } = await supabase
        .from("xceed_tickets")
        .upsert(rows.slice(index, index + 200), { onConflict: "event_id,qr_code" });
      if (error) throw error;
    }

    return NextResponse.json(
      { ok: true, event_id: eventId, synced_tickets: rows.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
