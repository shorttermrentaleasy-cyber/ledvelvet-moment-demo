import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json({ ok: false, error: message, extra }, { status });
}

function asString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

export async function GET() {
  try {
    const AIRTABLE_TOKEN =
      process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || "";
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
    const HERO_TABLE = process.env.AIRTABLE_TABLE_HERO || "HERO";

    if (!AIRTABLE_TOKEN) return jsonError("Missing AIRTABLE_TOKEN", 500);
    if (!AIRTABLE_BASE_ID) return jsonError("Missing AIRTABLE_BASE_ID", 500);

    // prende il primo record con Active = TRUE()
    const filterByFormula = "Active=TRUE()";
    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        HERO_TABLE
      )}` +
      `?maxRecords=1&filterByFormula=${encodeURIComponent(filterByFormula)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return jsonError(`Airtable HERO fetch failed (${res.status})`, 500, txt);
    }

    const data = await res.json();
    const rec = Array.isArray(data?.records) ? data.records[0] : null;
    const f = rec?.fields || {};

    const title = asString(f["Title"]);
    const subtitle = asString(f["Subtitle"]);
    const active = Boolean(f["Active"]);

    return NextResponse.json({ ok: true, hero: { title, subtitle, active } });
  } catch (err: any) {
    return jsonError(err?.message || "Server error", 500);
  }
}
