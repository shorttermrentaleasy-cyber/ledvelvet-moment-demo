import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

/**
 * Tipo RAW unificato usato sia per tickets che per bookings_fallback
 */
type XceedTicketRowRaw = {
  source: "tickets" | "bookings_fallback";
  xceed_event_ref: string;
  xceed_event_uuid: string | null;
  synced_at: string;
  ticket?: XceedTicket;
  booking?: XceedBooking;
  pass?: XceedBookingPass;
};

/**
 * Tipo riga per la tabella xceed_tickets
 */
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


export async function GET(req: NextRequest) {
  const apiKey = process.env.XCEED_API_KEY;
  const baseUrl = process.env.XCEED_BASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing XCEED_API_KEY or XCEED_BASE_URL",
      },
      { status: 500 }
    );
  }

  if (!supabaseUrl || !supabaseServiceRole) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const xceedEventRef = String(searchParams.get("eventId") || "").trim();
  const offset = searchParams.get("offset") || "0";
  const limit = searchParams.get("limit") || "100";
  const includeCancelledTickets =
    searchParams.get("includeCancelledTickets") || "true";

  if (!xceedEventRef) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required query param: eventId",
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false },
    });

    let { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, name, xceed_event_ref, xceed_event_uuid")
      .eq("xceed_event_ref", xceedEventRef)
      .maybeSingle();

    if (eventErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to resolve local event",
          details: eventErr.message,
          xceedEventRef,
        },
        { status: 500 }
      );
    }

    if (!eventRow) {
      const secondTry = await supabase
        .from("events")
        .select("id, name, xceed_event_ref, xceed_event_uuid")
        .eq("xceed_event_uuid", xceedEventRef)
        .maybeSingle();

      if (secondTry.error) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to resolve local event",
            details: secondTry.error.message,
            xceedEventRef,
          },
          { status: 500 }
        );
      }

      eventRow = secondTry.data;
    }

    if (!eventRow?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "No local event found for this Xceed identifier",
          xceedEventRef,
        },
        { status: 404 }
      );
    }

    const localEventId = String(eventRow.id);
    const xceedTicketsEventId =
      String((eventRow as any).xceed_event_uuid || "").trim() ||
      String((eventRow as any).xceed_event_ref || "").trim() ||
      xceedEventRef;

    const ticketsUrl =
      `${baseUrl}/v1/tickets` +
      `?offset=${encodeURIComponent(offset)}` +
      `&limit=${encodeURIComponent(limit)}` +
      `&events=${encodeURIComponent(xceedTicketsEventId)}` +
      `&includeCancelledTickets=${encodeURIComponent(
        includeCancelledTickets
      )}`;

    const ticketsFetch = await fetchJson(ticketsUrl, apiKey);

    if (!ticketsFetch.parsed) {
      return NextResponse.json(
        {
          ok: false,
          xceedStatus: ticketsFetch.status,
          error: "Invalid JSON response from Xceed tickets endpoint",
          raw: ticketsFetch.rawText,
          xceedEventRef,
          xceedTicketsEventId,
        },
        { status: 502 }
      );
    }

    if (
      !ticketsFetch.ok ||
      !ticketsFetch.parsed?.success ||
      !Array.isArray(ticketsFetch.parsed.data)
    ) {
      return NextResponse.json(
        {
          ok: false,
          xceedStatus: ticketsFetch.status,
          error: "Xceed tickets request failed",
          data: ticketsFetch.parsed,
          xceedEventRef,
          xceedTicketsEventId,
        },
        { status: ticketsFetch.status || 502 }
      );
    }

    const parsedTickets = ticketsFetch.parsed as XceedTicketsResponse;
    const nowIso = new Date().toISOString();

    let rows: XceedTicketRow[] = parsedTickets.data
      .filter((ticket) => !!ticket.qrCode)
      .map((ticket): XceedTicketRow => {
        const email = normalizeEmail(ticket.email ?? null);
        const phone = normalizePhone(ticket.phone ?? null);
        const fullName = buildFullName(ticket.firstName, ticket.lastName);

        return {
          event_id: localEventId,
          qr_code: ticket.qrCode,
          status:
            ticket.isActive === false
              ? "cancelled"
              : ticket.hasCheckedIn
              ? "checked_in"
              : "active",
          full_name: fullName,
          email,
          phone,
          booking_date: toIsoFromEpochMaybe(ticket.booking?.purchasedAt),
          transaction_id:
            ticket.booking?.bookingId != null
              ? String(ticket.booking.bookingId)
              : null,
          imported_at: nowIso,
          raw: {
            source: "tickets",
            xceed_event_ref: xceedEventRef,
            xceed_event_uuid: (eventRow as any).xceed_event_uuid ?? null,
            synced_at: nowIso,
            ticket,
          },
          buyer_email: email,
          buyer_phone: phone,
          buyer_email_norm: email,
          buyer_phone_norm: phone,
        };
      });

    let sourceUsed: "tickets" | "bookings_fallback" = "tickets";

    // Fallback su /v1/bookings se /v1/tickets non restituisce nulla
    if (rows.length === 0) {
      const bookingsUrl =
        `${baseUrl}/v1/bookings` +
        `?offset=${encodeURIComponent(offset)}` +
        `&limit=${encodeURIComponent(limit)}` +
        `&events=${encodeURIComponent(xceedTicketsEventId)}` +
        `&includeCancelledTickets=${encodeURIComponent(
          includeCancelledTickets
        )}`;

      const bookingsFetch = await fetchJson(bookingsUrl, apiKey);

      if (
        bookingsFetch.parsed &&
        bookingsFetch.ok &&
        bookingsFetch.parsed?.success &&
        Array.isArray(bookingsFetch.parsed.data)
      ) {
        const parsedBookings = bookingsFetch.parsed as XceedBookingsResponse;

        rows = parsedBookings.data.flatMap(
          (booking): XceedTicketRow[] => {
            const passes = Array.isArray(booking.passes)
              ? booking.passes
              : [];

            return passes
              .filter((pass) => !!pass.qrCode)
              .map((pass): XceedTicketRow => {
                const email = normalizeEmail(
                  pass.email ?? booking.buyer?.email ?? null
                );
                const phone = normalizePhone(
                  pass.phone ?? booking.buyer?.phone ?? null
                );
                const fullName =
                  buildFullName(pass.firstName, pass.lastName) ||
                  buildFullName(
                    booking.buyer?.firstName,
                    booking.buyer?.lastName
                  );

                const buyerEmail = normalizeEmail(
                  booking.buyer?.email ?? null
                );
                const buyerPhone = normalizePhone(
                  booking.buyer?.phone ?? null
                );

                return {
                  event_id: localEventId,
                  qr_code: String(pass.qrCode),
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
                  transaction_id:
                    booking.legacyId != null
                      ? String(booking.legacyId)
                      : null,
                  imported_at: nowIso,
                  raw: {
                    source: "bookings_fallback",
                    xceed_event_ref: xceedEventRef,
                    xceed_event_uuid:
                      (eventRow as any).xceed_event_uuid ?? null,
                    synced_at: nowIso,
                    booking,
                    pass,
                  },
                  buyer_email: buyerEmail,
                  buyer_phone: buyerPhone,
                  buyer_email_norm: buyerEmail,
                  buyer_phone_norm: buyerPhone,
                };
              });
          }
        );

        sourceUsed = "bookings_fallback";
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        xceedStatus: ticketsFetch.status,
        xceedEventRef,
        xceedTicketsEventId,
        localEventId,
        localEventName: eventRow.name ?? null,
        fetched: 0,
        upserted: 0,
        source: sourceUsed,
        message: "No tickets returned by Xceed",
      });
    }

    const { data: upsertedRows, error: upsertError } = await supabase
      .from("xceed_tickets")
      .upsert(rows, {
        onConflict: "event_id,qr_code",
      })
      .select(
        "id, event_id, qr_code, status, full_name, email, booking_date, transaction_id"
      );

    if (upsertError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase upsert failed on xceed_tickets",
          details: upsertError.message,
          xceedEventRef,
          xceedTicketsEventId,
          localEventId,
          source: sourceUsed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      xceedStatus: ticketsFetch.status,
      xceedEventRef,
      xceedTicketsEventId,
      localEventId,
      localEventName: eventRow.name ?? null,
      fetched: rows.length,
      upserted: upsertedRows?.length ?? 0,
      source: sourceUsed,
      preview: upsertedRows?.slice(0, 5) ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
