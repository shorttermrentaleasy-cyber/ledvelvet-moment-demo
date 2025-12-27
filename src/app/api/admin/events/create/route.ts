import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}
function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

type Payload = {
  eventName: string;
  date: string; // YYYY-MM-DD
  city?: string;
  venue?: string;
  status?: string;
  ticketPlatform?: string;

  // ✅ linked records to SPONSOR table (Airtable record ids)
  sponsors?: string[];

  ticketUrl?: string;
  heroImageUrl?: string;
  aftermovieUrl?: string;
  notes?: string;
};

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
  // AUTH
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return unauthorized();

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return unauthorized();
  if (!allowed.includes(session.user.email.toLowerCase())) return unauthorized();

  // ENV
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;

  if (!AIRTABLE_TOKEN) return badRequest("Missing AIRTABLE_TOKEN env var");
  if (!AIRTABLE_BASE_ID) return badRequest("Missing AIRTABLE_BASE_ID env var");
  if (!AIRTABLE_TABLE_EVENTS) return badRequest("Missing AIRTABLE_TABLE_EVENTS env var");

  // BODY
  const body = (await req.json()) as Payload;

  const eventName = (body.eventName || "").trim();
  const date = (body.date || "").trim();
  const city = (body.city || "").trim();
  const venue = (body.venue || "").trim();
  const status = (body.status || "").trim();
  const ticketPlatform = (body.ticketPlatform || "").trim();

  const ticketUrl = (body.ticketUrl || "").trim();
  const heroImageUrl = (body.heroImageUrl || "").trim();
  const aftermovieUrl = (body.aftermovieUrl || "").trim();
  const notes = (body.notes || "").trim();

  // ✅ Sponsors (array of Airtable record ids)
  const sponsors = Array.isArray(body.sponsors)
    ? body.sponsors.map((x) => (x || "").toString().trim()).filter(Boolean)
    : [];

  if (!eventName) return badRequest("Event Name obbligatorio");
  if (!date) return badRequest("Date obbligatoria");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest("Date deve essere YYYY-MM-DD");

  if (!isHttpUrl(ticketUrl)) return badRequest("Ticket Url non valida (serve http/https)");
  if (!isHttpUrl(heroImageUrl)) return badRequest("Hero Image URL non valida (serve http/https)");
  if (!isHttpUrl(aftermovieUrl)) return badRequest("Aftermovie URL non valida (serve http/https)");

  // MAPPING (case-sensitive: uguale ai tuoi campi Airtable)
  const fields: Record<string, any> = {
    "Event Name": eventName,
    date,
    City: city || undefined,
    Venue: venue || undefined,
    Status: status || undefined,
    "Ticket Platform": ticketPlatform || undefined,
    "Ticket Url": ticketUrl || undefined,
    Notes: notes || undefined,
  };

  // ✅ linked-record field in EVENTS (must be exactly "Sponsors")
  if (sponsors.length > 0) {
    fields["Sponsors"] = sponsors;
  }

  // Attachments: Airtable richiede [{url:"https://..."}]
  if (heroImageUrl) fields["Hero Image"] = [{ url: heroImageUrl }];
  if (aftermovieUrl) fields["Aftermovie"] = [{ url: aftermovieUrl }];

  // pulizia
  Object.keys(fields).forEach((k) => {
    if (fields[k] === undefined) delete fields[k];
  });

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_EVENTS
  )}`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const text = await r.text();

  if (!r.ok) {
    console.error("Airtable create event error:", r.status, text);
    return NextResponse.json({ ok: false, error: "Airtable error" }, { status: 500 });
  }

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  const recordId: string | null = data?.records?.[0]?.id ?? null;
  return NextResponse.json({ ok: true, recordId });
}
