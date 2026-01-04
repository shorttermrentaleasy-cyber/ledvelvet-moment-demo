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

function attachmentUrl(v: any): string {
  if (Array.isArray(v) && v.length > 0 && v[0]?.url) return String(v[0].url);
  return "";
}

function urlField(v: any): string {
  const s = asString(v);
  if (s) return s;
  return attachmentUrl(v);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeWebsite(urlRaw: string): string {
  const u = (urlRaw || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

type SponsorOut = { id: string; label: string; logoUrl?: string; website?: string };

async function fetchSponsorsDetails(opts: {
  token: string;
  baseId: string;
  sponsorsTable?: string;
  sponsorIds: string[];
}): Promise<Record<string, SponsorOut>> {
  const { token, baseId, sponsorsTable, sponsorIds } = opts;
  const map: Record<string, SponsorOut> = {};
  if (!sponsorsTable) return map;

  const ids = sponsorIds.filter(Boolean);
  if (ids.length === 0) return map;

  for (const batch of chunk(ids, 25)) {
    const formula = `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(",")})`;

    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sponsorsTable)}`);
    url.searchParams.set("pageSize", String(batch.length));
    url.searchParams.set("filterByFormula", formula);

    // campi reali (da tuo screenshot)
    url.searchParams.append("fields[]", "Brand Name");
    url.searchParams.append("fields[]", "Logo");
    url.searchParams.append("fields[]", "WebSite");

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await r.json();
    if (!r.ok) continue;

    const recs: AirtableRecord[] = Array.isArray(data?.records) ? data.records : [];
    for (const rec of recs) {
      const f = rec.fields || {};

      const label = asString(f["Brand Name"]) || rec.id;
      const logoUrl = attachmentUrl(f["Logo"]);
      const website = normalizeWebsite(asString(f["WebSite"]));

      map[rec.id] = {
        id: rec.id,
        label,
        ...(logoUrl ? { logoUrl } : {}),
        ...(website ? { website } : {}),
      };
    }
  }

  return map;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phaseRaw = asString(searchParams.get("phase"));
    const phase = phaseRaw.toLowerCase();
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 100);

    const {
      AIRTABLE_TOKEN,
      AIRTABLE_BASE_ID,
      AIRTABLE_TABLE_EVENTS,
      // ✅ compat: accetta sia PLURALE che SINGOLARE
      AIRTABLE_TABLE_SPONSORS,
      AIRTABLE_TABLE_SPONSOR,
    } = process.env as Record<string, string | undefined>;

    const sponsorsTable = AIRTABLE_TABLE_SPONSORS || AIRTABLE_TABLE_SPONSOR || "";

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return jsonError("Missing Airtable env (AIRTABLE_TOKEN / AIRTABLE_BASE_ID / AIRTABLE_TABLE_EVENTS).", 500);
    }

    const doFilter = phase === "past" || phase === "upcoming";
    const filterByFormula = doFilter ? `LOWER({Phase})="${phase}"` : "";

    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}`);
    url.searchParams.set("pageSize", String(limit));
    url.searchParams.append("sort[0][field]", "date");
    url.searchParams.append("sort[0][direction]", phase === "upcoming" ? "asc" : "desc");
    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    const data = await r.json();
    if (!r.ok) return jsonError("Airtable request failed", r.status, data);

    const records: AirtableRecord[] = data.records || [];

    const rawEvents = records.map((rec) => {
      const f = rec.fields || {};
      const sponsorIds = Array.isArray(f["Sponsors"]) ? f["Sponsors"] : f["Sponsors"] ?? [];

      return {
        id: rec.id,
        eventId: asString(f["Event ID"]),
        name: asString(f["Event Name"]),
        date: asString(f["date"]),
        city: asString(f["City"]),
        venue: asString(f["Venue"]),
        status: asString(f["Status"]),
        ticketPlatform: asString(f["Ticket Platform"]),
        ticketUrl: asString(f["Ticket Url"]),
        posterSrc: urlField(f["Hero Image"]),
        teaserUrl: asString(f["Teaser"]),
        aftermovieUrl: asString(f["Aftermovie"]),
        featured: Boolean(f["Featured"]),
        heroTitle: asString(f["Hero Title"]),
        heroSubtitle: asString(f["Hero Subtitle"]),
        notes: asString(f["Notes"]),
        sponsors: sponsorIds,
        phase: asString(f["Phase"]).toLowerCase(), // computed: NON TOCCARE
      };
    });

    const allSponsorIds = Array.from(
      new Set(
        rawEvents
          .flatMap((e: any) => (Array.isArray(e.sponsors) ? e.sponsors : []))
          .map((x: any) => asString(x))
          .filter(Boolean)
      )
    );

    const sponsorsMap = await fetchSponsorsDetails({
      token: AIRTABLE_TOKEN,
      baseId: AIRTABLE_BASE_ID,
      sponsorsTable,
      sponsorIds: allSponsorIds,
    });

    const events = rawEvents.map((e: any) => {
      const ids: string[] = Array.isArray(e.sponsors) ? e.sponsors.map(asString).filter(Boolean) : [];
      const sponsors: SponsorOut[] = ids.map((id) => sponsorsMap[id] || { id, label: id });
      return { ...e, sponsors };
    });

    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    return jsonError(err?.message || "Server error", 500);
  }
}
