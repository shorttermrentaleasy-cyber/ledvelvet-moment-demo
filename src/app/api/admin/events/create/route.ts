import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

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

    if (!isHttpUrl(HeroImageUrl) || !isHttpUrl(TeaserUrl) || !isHttpUrl(AftermovieUrl)) {
      return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
    }

    const fields: Record<string, any> = {
      "Event Name": eventName,
    };

    // optional fields
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

    // ✅ Sponsors linked record
    if (sponsors.length) fields["Sponsors"] = sponsors;

    // attachments + url fields
    if (HeroImageUrl) fields["Hero Image"] = [{ url: HeroImageUrl }];
    if (TeaserUrl) fields["Teaser"] = TeaserUrl; // URL field
    if (AftermovieUrl) fields["Aftermovie"] = AftermovieUrl; // URL field

    // Phase is computed -> DO NOT SET

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
    }

    const r = await fetch(
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

    const text = await r.text();
    if (!r.ok) {
      console.error("Airtable create failed:", r.status, text);
      return NextResponse.json(
        { ok: false, error: "Airtable create failed", details: text },
        { status: r.status }
      );
    }

    const created = text ? JSON.parse(text) : {};
    return NextResponse.json({ ok: true, id: created?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
