// src/app/api/events/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function txt(v: any): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
}

function pickFirstAttachmentUrl(v: any): string {
  // Airtable attachment: [{url, ...}]
  if (Array.isArray(v) && v.length > 0 && v[0]?.url) return String(v[0].url);
  return "";
}

function eventName(f: any, id: string) {
  return f["Event Name"] || f["Event name"] || f["Name"] || f["Title"] || `Event ${id.slice(0, 6)}`;
}

function eventDate(f: any) {
  return f?.date || f?.Date || f?.["Event Date"] || f?.["Event date"] || "";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phase = (searchParams.get("phase") || "").trim().toLowerCase(); // past|upcoming|all

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
    }

    const qs = new URLSearchParams();
    qs.set("pageSize", "100");

    // se phase = past|upcoming, filtro su {Phase}
    if (phase && phase !== "all") {
      // Airtable formula: {Phase} = "past"
      qs.set("filterByFormula", `{Phase}="${phase}"`);
    }

    // Ordine per data (desc) lato Airtable se il campo è "Date"
    // (se il tuo campo si chiama "date" minuscolo, l'ordinamento non funziona lato Airtable;
    // in quel caso ordiniamo lato JS sotto comunque)
    qs.set("sort[0][field]", "Date");
    qs.set("sort[0][direction]", "desc");

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}?${qs.toString()}`;

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    const j = await r.json();
    const records = Array.isArray(j?.records) ? j.records : [];

    const items = records.map((rec: any) => {
      const f = rec?.fields || {};

      const poster =
        pickFirstAttachmentUrl(f["Poster"]) ||
        txt(f["Poster URL"]) ||
        pickFirstAttachmentUrl(f["Image"]) ||
        txt(f["Image URL"]) ||
        "";

      const out = {
        id: rec.id,
        name: eventName(f, rec.id),
        city: txt(f.City),
        venue: txt(f.Venue),
        dateRaw: eventDate(f), // ISO o Airtable date
        phase: (txt(f.Phase) || "").toLowerCase(), // past/upcoming
        status: txt(f.Status), // SOLD OUT ecc.
        ticketPlatform: txt(f["Ticket Platform"]),
        ticketUrl: txt(f["Ticket URL"]) || txt(f["Ticket Link"]) || txt(f["Tickets URL"]) || "",
        galleryUrl: txt(f["Gallery URL"]) || txt(f["Gallery Link"]) || "",
        recapUrl: txt(f["Recap URL"]) || txt(f["Aftermovie URL"]) || txt(f["After Movie URL"]) || "",
        posterSrc: poster,
      };

      return out;
    });

    // Ordina lato JS comunque per sicurezza
    items.sort((a: any, b: any) => {
      const da = new Date(a.dateRaw || 0).getTime();
      const db = new Date(b.dateRaw || 0).getTime();
      return db - da;
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
