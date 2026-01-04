import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: any) {
  return String(v ?? "").trim();
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
    return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}?pageSize=50`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const text = await r.text();

  if (!r.ok) {
    console.error("Airtable events error:", r.status, text);
    return NextResponse.json({ ok: false, error: "Airtable error" }, { status: 500 });
  }

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  const records = (data.records || []).map((rec: any) => ({
    id: rec.id,
    fields: rec.fields,
  }));

  return NextResponse.json({ ok: true, records });
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const email = (session?.user?.email || "").toLowerCase().trim();
    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!email || !allowed.includes(email)) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const id = asString(body?.id);
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const fields: Record<string, any> = {};

    const eventName = asString(body?.eventName);
    if (eventName) fields["Event Name"] = eventName;

    if (body?.date !== undefined) fields["date"] = asString(body.date);
    if (body?.City !== undefined) fields["City"] = asString(body.City);
    if (body?.Venue !== undefined) fields["Venue"] = asString(body.Venue);
    if (body?.Status !== undefined) fields["Status"] = asString(body.Status);
    if (body?.TicketPlatform !== undefined) fields["Ticket Platform"] = asString(body.TicketPlatform);
    if (body?.TicketUrl !== undefined) fields["Ticket Url"] = asString(body.TicketUrl);
    if (body?.Notes !== undefined) fields["Notes"] = asString(body.Notes);

    if (body?.HeroTitle !== undefined) fields["Hero Title"] = asString(body.HeroTitle);
    if (body?.HeroSubtitle !== undefined) fields["Hero Subtitle"] = asString(body.HeroSubtitle);

    if (typeof body?.Featured === "boolean") fields["Featured"] = body.Featured;

    // Hero Image = attachment
    if (body?.HeroImageUrl !== undefined) {
      const u = asString(body.HeroImageUrl);
      if (u) fields["Hero Image"] = [{ url: u }];
      else fields["Hero Image"] = []; // allow clearing
    }

    // IMPORTANT: Teaser/Aftermovie = URL fields (STRING)
    if (body?.TeaserUrl !== undefined) fields["Teaser"] = asString(body.TeaserUrl);
    if (body?.AftermovieUrl !== undefined) fields["Aftermovie"] = asString(body.AftermovieUrl);

    // Phase is computed: DO NOT UPDATE IT

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
    }

    const r = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}/${id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    const text = await r.text();
    if (!r.ok) {
      console.error("Airtable update error:", r.status, text);
      return NextResponse.json({ ok: false, error: "Airtable update failed", details: text }, { status: r.status });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
