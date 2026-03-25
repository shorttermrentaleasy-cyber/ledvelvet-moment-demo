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
  const includeCancelledTickets = searchParams.get("includeCancelledTickets") || "true";

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

    // 1) risolvi evento locale da ref numerico O uuid
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

    // 2) costruisci URL Xceed DOPO aver risolto l'id giusto
    const url =
      `${baseUrl}/v1/tickets` +
      `?offset=${encodeURIComponent(offset)}` +
      `&limit=${encodeURIComponent(limit)}` +
      `&events=${encodeURIComponent(xceedTicketsEventId)}` +
      `&includeCancelledTickets=${encodeURIComponent(includeCancelledTickets)}`;

    const xceedResponse = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const rawText = await xceedResponse.text();

    let parsed: XceedTicketsResponse | null = null;
    try {
      parsed = JSON.parse(rawText) as XceedTicketsResponse;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          xceedStatus: xceedResponse.status,
          error: "Invalid JSON response from Xceed",
          raw: rawText,
          xceedEventRef,
          xceedTicketsEventId,
        },
        { status: 502 }
      );
    }

    if (!xceedResponse.ok || !parsed?.success || !Array.isArray(parsed.data)) {
      return NextResponse.json(
        {
          ok: false,
          xceedStatus: xceedResponse.status,
          error: "Xceed request failed",
          data: parsed,
          xceedEventRef,
          xceedTicketsEventId,
        },
        { status: xceedResponse.status || 502 }
      );
    }

    // 3) mappa nello schema operativo
    const nowIso = new Date().toISOString();

    const rows = parsed.data
      .filter((ticket) => !!ticket.qrCode)
      .map((ticket) => {
        const email = normalizeEmail(ticket.email ?? null);
        const phone = normalizePhone(ticket.phone ?? null);
        const fullName = buildFullName(ticket.firstName, ticket.lastName);

        const rawPayload = {
          source: "xceed_partner_api",
          xceed_event_ref: xceedEventRef,
          xceed_event_uuid: (eventRow as any).xceed_event_uuid ?? null,
          synced_at: nowIso,
          ticket,
        };

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
            ticket.booking?.bookingId != null ? String(ticket.booking.bookingId) : null,
          imported_at: nowIso,
          raw: rawPayload,

          buyer_email: email,
          buyer_phone: phone,
          buyer_email_norm: email,
          buyer_phone_norm: phone,
        };
      });

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        xceedStatus: xceedResponse.status,
        xceedEventRef,
        xceedTicketsEventId,
        localEventId,
        localEventName: eventRow.name ?? null,
        fetched: 0,
        upserted: 0,
        message: "No tickets returned by Xceed",
      });
    }

    // 4) upsert nella tabella operativa
    const { data: upsertedRows, error: upsertError } = await supabase
      .from("xceed_tickets")
      .upsert(rows, {
        onConflict: "event_id,qr_code",
      })
      .select("id, event_id, qr_code, status, full_name, email, booking_date, transaction_id");

    if (upsertError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase upsert failed on xceed_tickets",
          details: upsertError.message,
          xceedEventRef,
          xceedTicketsEventId,
          localEventId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      xceedStatus: xceedResponse.status,
      xceedEventRef,
      xceedTicketsEventId,
      localEventId,
      localEventName: eventRow.name ?? null,
      fetched: parsed.data.length,
      upserted: upsertedRows?.length ?? 0,
      preview: upsertedRows?.slice(0, 5) ?? [],
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