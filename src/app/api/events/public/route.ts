import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord = { id: string; fields: Record<string, any> };

function pickStr(v: any) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function GET() {
  try {
    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
    }

    // Scarico fino a 100 record (poi se serve facciamo paginazione)
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}?pageSize=100`;

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    const j = await r.json();
    const records: AirtableRecord[] = j?.records || [];

    // Mapping: adatta i nomi campi se i tuoi in Airtable sono diversi
    const items = records.map((rec) => {
      const f = rec.fields || {};
      return {
        id: rec.id,
        name: pickStr(f["Event Name"] ?? f["Event name"] ?? f["Name"]),
        city: pickStr(f["City"]),
        dateISO: pickStr(f["date"] ?? f["Date"]), // data vera (ISO)
        href: pickStr(f["Ticket Link"] ?? f["href"] ?? f["Link"]),
        tag: pickStr(f["Status"] ?? f["Tag"]),
        posterSrc: pickStr(f["Poster"] ?? f["posterSrc"] ?? f["Cover"]),
        videoMp4: pickStr(f["Video Mp4"] ?? f["videoMp4"] ?? f["Aftermovie Mp4"]),
        phase: pickStr(f["Phase"]), // "past" | "upcoming"
      };
    });

    // Sort: più recenti prima
    items.sort((a, b) => new Date(b.dateISO || 0).getTime() - new Date(a.dateISO || 0).getTime());

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
