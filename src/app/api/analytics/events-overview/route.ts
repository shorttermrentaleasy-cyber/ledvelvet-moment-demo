import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!allowed.includes(email)) {
    return NextResponse.json(
      { ok: false, error: "AccessDenied" },
      { status: 403 }
    );
  }

  return null;
}


function toCents(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(",", ".").replace(/[^\d.]/g, "");
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (number > 1000) return Math.round(number);
  return Math.round(number * 100);
}

function getQrCode(ticket: any): string | null {
  const raw = ticket.raw || {};
  return (
    raw?.ticket?.qrCode ||
    raw?.pass?.qrCode ||
    raw?.["QR Code"] ||
    raw?.qrCode ||
    raw?.qr_code ||
    null
  );
}

function getAmountFromQr(qr: string | null): number | null {
  if (!qr) return null;
  const parts = String(qr).split("|");
  if (parts.length < 5) return null;
  const cents = Number(parts[4]);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

function normalizeTicketType(ticket: any): string {
  const raw = ticket.raw || {};
  const offerType = String(
    raw?.offer?.type ||
      raw?.ticket?.offer?.type ||
      raw?.booking?.offer?.type ||
      raw?.["Booking type"] ||
      ""
  ).toLowerCase();
  const offerName = String(
    raw?.offer?.name ||
      raw?.ticket?.offer?.name ||
      raw?.booking?.offer?.name ||
      raw?.["Offer title"] ||
      ""
  ).toLowerCase();
  const source = String(raw?.source || "").toLowerCase();
  const combined = `${offerType} ${offerName} ${source}`;

  if (
    combined.includes("penale") ||
    combined.includes("penalty") ||
    combined.includes("late") ||
    combined.includes("after") ||
    combined.includes("fee")
  ) return "penalty";
  if (combined.includes("drink")) return "drink";
  if (
    combined.includes("guest") ||
    combined.includes("guest-list") ||
    combined.includes("guest list") ||
    combined.includes("guestlist")
  ) return "guest-list";
  if (
    combined.includes("bottle") ||
    combined.includes("table") ||
    combined.includes("bottle-service") ||
    combined.includes("bottle service")
  ) return "bottle-service";
  if (combined.includes("cancel")) return "cancelled";
  return "ticket";
}

function getTicketAmountCents(ticketRow: any): number | null {
  const raw = ticketRow.raw || {};
  const ticket = raw.ticket || {};
  const booking = ticket.booking || raw.booking || {};
  const offer = ticket.offer || raw.offer || {};
  const qr = getQrCode(ticketRow);
  const candidates = [
    raw["Price"],
    raw["Online Price"],
    raw["Amount"],
    raw["Total"],
    raw["Paid"],
    ticket?.offer?.price?.amount,
    ticket?.offer?.price?.onlinePrice,
    ticket?.offer?.price?.offlinePrice,
    offer?.price?.amount,
    offer?.price?.onlinePrice,
    offer?.price?.offlinePrice,
    ticket.price,
    ticket.amount,
    ticket.total,
    ticket.paidAmount,
    ticket.amountPaid,
    booking.price,
    booking.amount,
    booking.total,
    booking.totalPaid,
    booking.amountPaid,
    booking.finalPrice,
    offer.price,
    offer.amount,
    getAmountFromQr(qr),
    raw["Offline Price"],
  ];

  for (const candidate of candidates) {
    const cents = toCents(candidate);
    if (cents !== null) return cents;
  }
  return null;
}

export async function GET() {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY || assertEnv("SUPABASE_SERVICE_ROLE");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, name, starts_at, venue, city")
      .order("starts_at", { ascending: false });

    if (eventsError) throw eventsError;

    const counts = new Map<
      string,
      {
        total: number;
        checked_in: number;
        active: number;
        cancelled: number;
        other: number;
        revenue_cents: number;
        missing_amount_tickets: number;
      }
    >();

    const bottleRevenueKeys = new Map<string, Set<string>>();

    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data: tickets, error: ticketsError } = await supabase
        .from("xceed_tickets")
        .select("event_id, status, raw")
        .range(from, from + pageSize - 1);

      if (ticketsError) throw ticketsError;

      for (const ticket of tickets || []) {
        if (!ticket.event_id) continue;

        const current = counts.get(ticket.event_id) || {
          total: 0,
          checked_in: 0,
          active: 0,
          cancelled: 0,
          other: 0,
          revenue_cents: 0,
          missing_amount_tickets: 0,
        };
        const status = String(ticket.status || "").trim().toLowerCase();

        current.total += 1;
        if (status === "checked_in") current.checked_in += 1;
        else if (status === "active") current.active += 1;
        else if (status === "cancelled") current.cancelled += 1;
        else current.other += 1;

        const qr = getQrCode(ticket);
        const type = normalizeTicketType(ticket);
        if (qr && (status !== "cancelled" || type === "penalty")) {
          const amountCents = getTicketAmountCents(ticket);

          if (amountCents === null) {
            current.missing_amount_tickets += 1;
          } else if (type === "bottle-service") {
            const raw = ticket.raw || {};
            const revenueKey = String(
              raw?.booking?.paymentId ||
                raw?.booking?.id ||
                raw?.ticket?.booking?.paymentId ||
                raw?.ticket?.booking?.bookingUuid ||
                qr
            );
            const eventKeys = bottleRevenueKeys.get(ticket.event_id) || new Set<string>();

            if (!eventKeys.has(revenueKey)) {
              eventKeys.add(revenueKey);
              bottleRevenueKeys.set(ticket.event_id, eventKeys);
              current.revenue_cents += amountCents;
            }
          } else {
            current.revenue_cents += amountCents;
          }
        }

        counts.set(ticket.event_id, current);
      }

      if (!tickets || tickets.length < pageSize) break;
      from += pageSize;
    }

    return NextResponse.json({
      ok: true,
      events: (events || []).map((event) => {
        const eventCounts = counts.get(event.id) || {
          total: 0,
          checked_in: 0,
          active: 0,
          cancelled: 0,
          other: 0,
          revenue_cents: 0,
          missing_amount_tickets: 0,
        };
        const validTickets = eventCounts.checked_in + eventCounts.active;

        return {
          ...event,
          ...eventCounts,
          valid_tickets: validTickets,
          revenue_eur: eventCounts.revenue_cents / 100,
          conversion_rate:
            validTickets > 0 ? eventCounts.checked_in / validTickets : 0,
        };
      }),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
