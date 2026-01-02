import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord = { id: string; fields: Record<string, any> };

function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json({ ok: false, error: message, extra }, { status });
}

function asString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

// Airtable attachment field → first url
function attachmentUrl(v: any): string {
  if (Array.isArray(v) && v.length > 0 && v[0]?.url) return String(v[0].url);
  return "";
}

// Some fields can be either URL string OR attachment array
function urlField(v: any): string {
  const s = asString(v);
  if (s) return s;
  return attachmentUrl(v);
}

function asBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  const s = asString(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phaseRaw = asString(searchParams.get("phase")); // "past" | "upcoming" | ""
    const phase = phaseRaw.toLowerCase(); // normalize
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 100);

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return jsonError(
        "Missing Airtable env (AIRTABLE_TOKEN / AIRTABLE_BASE_ID / AIRTABLE_TABLE_EVENTS).",
        500
      );
    }

    // Filter only if phase is valid
    const doFilter = phase === "past" || phase === "upcoming";
    const filterByFormula = doFilter ? `LOWER({Phase})="${phase}"` : "";

    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE_EVENTS
      )}`
    );

    url.searchParams.set("pageSize", String(limit));

    // Sort:
    // - if phase=past => date DESC
    // - if phase=upcoming => date ASC
    // - if no phase => date DESC (most recent first)
    url.searchParams.append("sort[0][field]", "date");
    url.searchParams.append(
      "sort[0][direction]",
      phase === "upcoming" ? "asc" : "desc"
    );

    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    const data = await r.json();

    if (!r.ok) {
      return jsonError("Airtable request failed", r.status, data);
    }

    const records: AirtableRecord[] = data.records || [];

    const events = records.map((rec) => {
      const f = rec.fields || {};

      const heroUrl = urlField(f["Hero Image"]);
      const teaserUrl = urlField(f["Teaser"]);
      const aftermovieUrl = urlField(f["Aftermovie"]);
      const featured = asBool(f["Featured"]);

      return {
        id: rec.id,
        eventId: asString(f["Event ID"]),
        name: asString(f["Event Name"]),
        date: asString(f["date"]), // in Airtable è "date" (minuscolo) come nel tuo screenshot
        city: asString(f["City"]),
        venue: asString(f["Venue"]),
        status: asString(f["Status"]),
        ticketPlatform: asString(f["Ticket Platform"]),
        ticketUrl: asString(f["Ticket Url"]),
        posterSrc: heroUrl, // MomentPage usa posterSrc

        // NEW fields for /moment UI
        teaserUrl, // Upcoming preview
        aftermovieUrl, // Past recap
        featured, // Hero selection

        notes: asString(f["Notes"]),
        sponsors: f["Sponsors"] ?? [],
        phase: asString(f["Phase"]).toLowerCase(), // "past" | "upcoming"
      };
    });

    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    return jsonError(err?.message || "Server error", 500);
  }
}
