import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isAdmin(email?: string | null) {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

function pickString(v: any) {
  const s = (v ?? "").toString().trim();
  return s || "";
}

function firstAttachmentUrl(v: any): string {
  if (!Array.isArray(v) || v.length === 0) return "";
  return v[0]?.url || "";
}

// test route
export async function GET() {
  return json(200, { ok: true, route: "duplicate" });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const sourceId = pickString(body?.id);

    if (!sourceId) return json(400, { ok: false, error: "Missing id" });

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return json(500, { ok: false, error: "Missing Airtable env" });
    }

    // 1) Read source record
    const getUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}/${sourceId}`;

    const rGet = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    const sourceText = await rGet.text();
    if (!rGet.ok) {
      console.error("Airtable read for duplicate failed:", rGet.status, sourceText);
      return json(500, { ok: false, error: "Airtable read failed" });
    }

    const source = sourceText ? JSON.parse(sourceText) : {};
    const f = source.fields || {};

    // 2) Build new fields (safe subset)
    const name = pickString(f["Event Name"]);
    const city = pickString(f["City"]);
    const venue = pickString(f["Venue"]);
    const ticketPlatform = pickString(f["Ticket Platform"]);
    const ticketUrl = pickString(f["Ticket Url"]);
    const notes = pickString(f["Notes"]);

    const heroUrl = firstAttachmentUrl(f["Hero Image"]);
    const afterUrl = firstAttachmentUrl(f["Aftermovie"]);

    // Default for duplicated record:
    // - date = empty (force user to set)
    // - status = Upcoming (if you prefer blank, change to "")
    const newFields: Record<string, any> = {
  	"Event Name": name ? `${name} (COPY)` : "New Event (COPY)",
  	// ❌ NON passiamo il campo date se non valido
  	City: city || undefined,
  	Venue: venue || undefined,
  	Status: "Upcoming",
  	"Ticket Platform": ticketPlatform || undefined,
  	"Ticket Url": ticketUrl || undefined,
  	Notes: notes || undefined,
	};

    if (heroUrl) newFields["Hero Image"] = [{ url: heroUrl }];
    if (afterUrl) newFields["Aftermovie"] = [{ url: afterUrl }];

    // remove undefined
    Object.keys(newFields).forEach((k) => newFields[k] === undefined && delete newFields[k]);

    // 3) Create new record
    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}`;

    const rCreate = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: newFields }),
    });

    const createText = await rCreate.text();
    if (!rCreate.ok) {
      console.error("Airtable create duplicate failed:", rCreate.status, createText);
      return json(500, { ok: false, error: "Airtable create failed" });
    }

    const created = createText ? JSON.parse(createText) : {};
    return json(200, { ok: true, id: created?.id });
  } catch (e: any) {
    console.error("Duplicate route error:", e);
    return json(500, { ok: false, error: "Server error" });
  }
}
