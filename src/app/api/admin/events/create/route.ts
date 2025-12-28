import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

/* -------------------- helpers -------------------- */

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/* -------------------- CREATE EVENT -------------------- */

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

    const eventName = String(body?.eventName || "").trim();
    if (!eventName) {
      return NextResponse.json(
        { ok: false, error: "Missing eventName" },
        { status: 400 }
      );
    }

    const fields: Record<string, any> = {
      "Event Name": eventName,
    };

    // campi opzionali
    if (body?.date) fields["date"] = body.date;
    if (body?.City) fields["City"] = body.City;
    if (body?.Venue) fields["Venue"] = body.Venue;
    if (body?.Status) fields["Status"] = body.Status;
    if (body?.TicketPlatform) fields["Ticket Platform"] = body.TicketPlatform;
    if (body?.TicketUrl) fields["Ticket Url"] = body.TicketUrl;
    if (body?.Notes) fields["Notes"] = body.Notes;

    // attachments (URL)
    if (body?.HeroImageUrl) {
      fields["Hero Image"] = [{ url: String(body.HeroImageUrl) }];
    }
    if (body?.AftermovieUrl) {
      fields["Aftermovie"] = [{ url: String(body.AftermovieUrl) }];
    }

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json(
        { ok: false, error: "Missing Airtable env" },
        { status: 500 }
      );
    }

    const r = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE_EVENTS
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json(
        { ok: false, error: "Airtable create failed", details: t },
        { status: r.status }
      );
    }

    const created = await r.json();

    return NextResponse.json({
      ok: true,
      id: created?.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
