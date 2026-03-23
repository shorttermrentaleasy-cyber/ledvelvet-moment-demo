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
  const eventId = searchParams.get("eventId");
  const offset = searchParams.get("offset") || "0";
  const limit = searchParams.get("limit") || "100";
  const includeCancelledTickets =
    searchParams.get("includeCancelledTickets") || "true";

  if (!eventId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required query param: eventId",
      },
      { status: 400 }
    );
  }

  const url =
    `${baseUrl}/v1/tickets` +
    `?offset=${encodeURIComponent(offset)}` +
    `&limit=${encodeURIComponent(limit)}` +
    `&events=${encodeURIComponent(eventId)}` +
    `&includeCancelledTickets=${encodeURIComponent(includeCancelledTickets)}`;

  try {
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
        },
        { status: xceedResponse.status || 502 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false },
    });

    const rows = parsed.data
      .filter((ticket) => !!ticket.qrCode)
      .map((ticket) => ({
        xceed_event_uuid: eventId,
        xceed_booking_uuid: ticket.booking?.bookingUuid ?? null,
        xceed_booking_id: ticket.booking?.bookingId ?? null,
        qr_code: ticket.qrCode,

        first_name: ticket.firstName ?? null,
        last_name: ticket.lastName ?? null,
        email: ticket.email ?? (ticket.booking as any)?.email ?? null,
        phone: ticket.phone ?? (ticket.booking as any)?.phone ?? null,
        has_checked_in: Boolean(ticket.hasCheckedIn),
        checked_in_time: ticket.checkedInTime ?? null,
        is_active: ticket.isActive ?? null,
        booking_confirmed: ticket.booking?.confirmed ?? null,

        offer_id: ticket.offer?.id ?? null,
        offer_uuid: ticket.offer?.uuid ?? null,
        offer_type: ticket.offer?.type ?? null,
        offer_name: ticket.offer?.name ?? null,

        channel_id: ticket.booking?.channel?.id ?? null,
        channel_legacy_id: ticket.booking?.channel?.legacyId ?? null,
        channel_name: ticket.booking?.channel?.name ?? null,
        channel_slug: ticket.booking?.channel?.slug ?? null,

        purchased_at: ticket.booking?.purchasedAt ?? null,
        booking_updated_at: ticket.booking?.updatedAt ?? null,

        raw_payload: ticket,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        xceedStatus: xceedResponse.status,
        eventId,
        fetched: 0,
        upserted: 0,
        message: "No tickets returned by Xceed",
      });
    }

    const { data: upsertedRows, error: upsertError } = await supabase
      .from("xceed_partner_tickets")
      .upsert(rows, {
        onConflict: "qr_code",
      })
      .select("id, qr_code, has_checked_in, checked_in_time, offer_type, offer_name");

    if (upsertError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase upsert failed",
          details: upsertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      xceedStatus: xceedResponse.status,
      eventId,
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