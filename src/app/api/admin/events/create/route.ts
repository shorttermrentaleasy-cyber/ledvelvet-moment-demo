import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { buildMemberTicketBaseUrl } from "@/lib/member-ticket";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function asString(v: any) {
  return String(v ?? "").trim();
}

function asStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter(Boolean);
}

function isHttpUrl(v: string) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function asBoolean(v: any, def = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "on", "yes"].includes(s)) return true;
    if (["false", "0", "off", "no", ""].includes(s)) return false;
  }
  if (typeof v === "number") return v !== 0;
  return def;
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toStartsAt(input: string): string | null {
  const s = asString(input);
  if (!s) return null;

  // da form admin arriva tipicamente YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type ParsedXceedPublicUrl = {
  isXceed: boolean;
  xceedUrl: string | null;
  legacyId: number | null;
  channel: string | null;
};

function parseXceedPublicUrl(input: string): ParsedXceedPublicUrl {
  const raw = asString(input);
  if (!raw) {
    return {
      isXceed: false,
      xceedUrl: null,
      legacyId: null,
      channel: null,
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      isXceed: false,
      xceedUrl: raw,
      legacyId: null,
      channel: null,
    };
  }

  const host = url.hostname.toLowerCase();
  const isProdXceed = host === "xceed.me" || host.endsWith(".xceed.me");
  if (!isProdXceed) {
    return {
      isXceed: false,
      xceedUrl: raw,
      legacyId: null,
      channel: null,
    };
  }

  const parts = url.pathname.split("/").filter(Boolean);

  // Pattern atteso:
  // /en/pisa/event/anfiteatro-vol-2/222493/channel/led-velvet
  let legacyId: number | null = null;
  let channel: string | null = null;

  const channelIdx = parts.findIndex((p) => p.toLowerCase() === "channel");
  if (channelIdx >= 0 && parts[channelIdx + 1]) {
    channel = parts[channelIdx + 1].trim() || null;
  }

  const eventIdx = parts.findIndex((p) => p.toLowerCase() === "event");
  if (eventIdx >= 0) {
    for (let i = eventIdx + 1; i < parts.length; i++) {
      if (/^\d+$/.test(parts[i])) {
        const n = Number(parts[i]);
        if (Number.isInteger(n) && n > 0) {
          legacyId = n;
          break;
        }
      }
    }
  }

  return {
    isXceed: true,
    xceedUrl: raw,
    legacyId,
    channel,
  };
}

type XceedEventFetchResult = {
  ok: boolean;
  legacyId: number | null;
  eventUuid: string | null;
  name: string | null;
  startsAt: string | null;
  venue: string | null;
  city: string | null;
};

async function fetchXceedEventByLegacyId(
  legacyId: number,
  channel: string | null
): Promise<XceedEventFetchResult> {
  const qp = new URLSearchParams();
  if (channel) qp.set("channel", channel);

  const url = `https://events.xceed.me/v1/events/${legacyId}${qp.toString() ? `?${qp.toString()}` : ""}`;

  const r = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!r.ok) {
    return {
      ok: false,
      legacyId,
      eventUuid: null,
      name: null,
      startsAt: null,
      venue: null,
      city: null,
    };
  }

  const j = await r.json().catch(() => null);
  const data = j?.data;

  const startingTime =
    typeof data?.startingTime === "number" && Number.isFinite(data.startingTime)
      ? new Date(data.startingTime * 1000).toISOString()
      : null;

  return {
    ok: Boolean(j?.success && data),
    legacyId: typeof data?.legacyId === "number" ? data.legacyId : legacyId,
    eventUuid: typeof data?.id === "string" ? data.id : null,
    name: typeof data?.name === "string" ? data.name.trim() : null,
    startsAt: startingTime,
    venue: typeof data?.venue?.name === "string" ? data.venue.name.trim() : null,
    city: typeof data?.venue?.city?.name === "string" ? data.venue.city.name.trim() : null,
  };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    const email = (session?.user?.email || "").toLowerCase().trim();
    if (!email) return unauthorized();

    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.includes(email)) return unauthorized();

    const body = await req.json().catch(() => ({}));

    const eventName = asString(body?.eventName);
    if (!eventName) {
      return NextResponse.json({ ok: false, error: "Missing eventName" }, { status: 400 });
    }

    // Sponsors must be Airtable record IDs (recXXXX)
    const sponsors = asStringArray(body?.Sponsors);

    const HeroImageUrl = asString(body?.HeroImageUrl);
    const TeaserUrl = asString(body?.TeaserUrl);
    const AftermovieUrl = asString(body?.AftermovieUrl);
    const ticketUrl = asString(body?.TicketUrl);
    const memberTicketCode = asString(body?.MemberTicketCode);
    const memberTicketEnabled = asBoolean(body?.MemberTicketEnabled, false);
    const memberTicketUrl = memberTicketCode
      ? buildMemberTicketBaseUrl(ticketUrl, memberTicketCode)
      : null;

    if (
      !isHttpUrl(HeroImageUrl) ||
      !isHttpUrl(TeaserUrl) ||
      !isHttpUrl(AftermovieUrl)
    ) {
      return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
    }

    if (memberTicketCode && !memberTicketUrl) {
      return NextResponse.json(
        { ok: false, error: "Il codice soci richiede un link evento Xceed valido." },
        { status: 400 }
      );
    }

    if (memberTicketEnabled && !memberTicketUrl) {
      return NextResponse.json(
        { ok: false, error: "Inserisci il codice univoco Xceed prima di abilitare l'acquisto soci." },
        { status: 400 }
      );
    }

    const fields: Record<string, any> = {
      "Event Name": eventName,
    };

    // optional Airtable fields
    if (body?.date) fields["date"] = asString(body.date);
    if (body?.City) fields["City"] = asString(body.City);
    if (body?.Venue) fields["Venue"] = asString(body.Venue);
    if (body?.Status) fields["Status"] = asString(body.Status);
    if (body?.TicketPlatform) fields["Ticket Platform"] = asString(body.TicketPlatform);
    if (body?.TicketUrl) fields["Ticket Url"] = asString(body.TicketUrl);
    if (body?.Notes) fields["Notes"] = asString(body.Notes);

    // hero text
    if (body?.HeroTitle) fields["Hero Title"] = asString(body.HeroTitle);
    if (body?.HeroSubtitle) fields["Hero Subtitle"] = asString(body.HeroSubtitle);

    // featured
    if (typeof body?.Featured === "boolean") fields["Featured"] = body.Featured;

    // sponsors linked record
    if (sponsors.length) fields["Sponsors"] = sponsors;

    // attachments + url fields
    if (HeroImageUrl) fields["Hero Image"] = [{ url: HeroImageUrl }];
    if (TeaserUrl) fields["Teaser"] = TeaserUrl;
    if (AftermovieUrl) fields["Aftermovie"] = AftermovieUrl;

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
    }

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    const airtableText = await airtableRes.text();
    if (!airtableRes.ok) {
      console.error("Airtable create failed:", airtableRes.status, airtableText);
      return NextResponse.json(
        { ok: false, error: "Airtable create failed", details: airtableText },
        { status: airtableRes.status }
      );
    }

    const created = airtableText ? JSON.parse(airtableText) : {};

    // ---- bridge minimo verso Supabase events ----
    const parsedXceed = parseXceedPublicUrl(ticketUrl);

    let xceedEventRef: number | null = null;
    let xceedEventUuid: string | null = null;

    let finalName = eventName;
    let finalStartsAt = toStartsAt(asString(body?.date));
    let finalVenue = asString(body?.Venue) || null;
    let finalCity = asString(body?.City) || null;
    let finalXceedUrl = parsedXceed.isXceed ? parsedXceed.xceedUrl : null;

    if (parsedXceed.isXceed && parsedXceed.legacyId) {
      const xceedData = await fetchXceedEventByLegacyId(parsedXceed.legacyId, parsedXceed.channel);

      xceedEventRef = xceedData.legacyId;
      xceedEventUuid = xceedData.eventUuid;
    }

    const supabase = supabaseAdmin();
    const requireTicket = asBoolean(body?.RequireTicket, true);
    const requireMembership = asBoolean(body?.RequireMembership, true);
    const requireActiveMembership = asBoolean(body?.RequireActiveMembership, false);
    const insertPayload = {
      name: finalName,
      starts_at: finalStartsAt,
      venue: finalVenue,
      city: finalCity,
      xceed_url: finalXceedUrl,
      xceed_event_ref: xceedEventRef,
      xceed_event_uuid: xceedEventUuid,
      airtable_record_id: created?.id || null,
      require_ticket: requireTicket,
      require_membership: requireMembership,
      require_active_membership: requireActiveMembership,
      member_ticket_url: memberTicketUrl || null,
      member_ticket_enabled: memberTicketEnabled,
    };

    const { data: insertedEvent, error: supabaseError } = await supabase
      .from("events")
      .insert(insertPayload)
      .select("id")
      .single();


if (supabaseError) {
  console.error("Supabase events insert failed FULL:", {
    message: supabaseError.message,
    details: (supabaseError as any).details,
    hint: (supabaseError as any).hint,
    code: (supabaseError as any).code,
    createdId: created?.id || null,
    insertPayload,
  });

  const pgCode = (supabaseError as any).code || null;
  const pgDetails = (supabaseError as any).details || null;

  const isDuplicateXceed =
    pgCode === "23505" &&
    typeof supabaseError.message === "string" &&
    supabaseError.message.includes("events_xceed_event_ref_uniq");

  if (isDuplicateXceed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Esiste già un evento in Supabase con questo link Xceed. Per evitare sovrascritture automatiche, il salvataggio DoorCheck non è stato aggiornato. Verifica l'evento esistente o usa un link Xceed diverso.",
        airtableId: created?.id || null,
        pg_details: pgDetails,
        pg_code: pgCode,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Supabase events insert failed",
      airtableId: created?.id || null,
      details: supabaseError.message,
      pg_details: pgDetails,
      pg_hint: (supabaseError as any).hint || null,
      pg_code: pgCode,
    },
    { status: 500 }
  );
}





    return NextResponse.json({
      ok: true,
      id: created?.id || null, // Airtable rec...
      supabaseEventId: insertedEvent?.id || null,
      xceed: {
        isXceed: parsedXceed.isXceed,
        legacyId: xceedEventRef,
        eventUuid: xceedEventUuid,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
