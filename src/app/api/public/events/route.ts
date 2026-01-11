import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord = { id: string; fields: Record<string, any> };

function jsonError(message: string, status = 500, extra?: any) {
  
return NextResponse.json(
  { ok: false, error: message, extra },
  {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  }
);


}

function asString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function urlField(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    if (first && typeof first === "object") {
      const url = first.url || first.thumbnails?.large?.url || first.thumbnails?.full?.url || first.thumbnails?.small?.url;
      return typeof url === "string" ? url : "";
    }
  }
  if (typeof v === "object" && typeof v.url === "string") return v.url.trim();
  return "";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

  const batches = chunk(ids, 50);

  for (const batch of batches) {
    const filter = `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sponsorsTable)}?filterByFormula=${encodeURIComponent(
      filter
    )}`;

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Airtable sponsors fetch failed (${r.status}): ${txt}`);
    }

    const j = await r.json();
    const records: AirtableRecord[] = Array.isArray(j?.records) ? j.records : [];

    for (const rec of records) {
      const f = rec.fields || {};

      // ✅ FIX: use the real field name in Airtable ("Brand Name")
      const labelRaw =
        asString(f["Brand Name"]) ||
        asString(f["Brand"]) ||
        asString(f["Name"]) ||
        asString(f["Company"]) ||
        asString(f["Title"]);

      // Never expose Airtable record IDs as labels
      const label = labelRaw;

      const logoUrl = urlField(f["Logo"] || f["logo"] || f["logoUrl"]);
      const website = asString(f["WebSite"] || f["Website"] || f["website"]);

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
    const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 100)));

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || "";
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
    const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE || "EVENTS";
    const SPONSORS_TABLE = process.env.AIRTABLE_SPONSORS_TABLE || "SPONSOR";

    if (!AIRTABLE_TOKEN) return jsonError("Missing AIRTABLE_TOKEN", 500);
    if (!AIRTABLE_BASE_ID) return jsonError("Missing AIRTABLE_BASE_ID", 500);

    const eventsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      EVENTS_TABLE
    )}?pageSize=${limit}&sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc`;

    const r = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return jsonError(`Airtable events fetch failed (${r.status})`, 500, txt);
    }

    const j = await r.json();
    const records: AirtableRecord[] = Array.isArray(j?.records) ? j.records : [];

    // gather sponsor ids across events
    const allSponsorIds: string[] = [];
    for (const rec of records) {
      const f = rec.fields || {};
      const linked = f["Event Sponsored"] || f["Sponsors"] || [];
      if (Array.isArray(linked)) {
        for (const id of linked) {
          if (typeof id === "string" && id) allSponsorIds.push(id);
        }
      }
    }

    const sponsorDetails = await fetchSponsorsDetails({
      token: AIRTABLE_TOKEN,
      baseId: AIRTABLE_BASE_ID,
      sponsorsTable: SPONSORS_TABLE,
      sponsorIds: allSponsorIds,
    });

    const events = records.map((rec) => {
      const f = rec.fields || {};

      const sponsorsLinked = (Array.isArray(f["Event Sponsored"]) ? f["Event Sponsored"] : Array.isArray(f["Sponsors"]) ? f["Sponsors"] : []) as string[];

      const sponsors = sponsorsLinked
        .map((id) => sponsorDetails[id])
        .filter(Boolean)
        // IMPORTANT: filter out items with empty label (so we never show rec ids)
        .filter((s) => !!s.label);

      return {
        id: rec.id,
        eventId: rec.id,
        name: asString(f["Event Name"] || f["name"]),
        date: asString(f["date"]),
        city: asString(f["City"] || f["city"]),
        venue: asString(f["Venue"] || f["venue"]),
        status: asString(f["status"] || f["Status"]),
        ticketPlatform: asString(f["Ticket Platform"] || f["ticketPlatform"]),
        ticketUrl: asString(f["Ticket Url"] || f["ticketUrl"]),
        posterSrc: asString(f["Hero Image"] || f["posterSrc"]),
        teaserUrl: asString(f["Teaser"] || f["teaserUrl"]),
        aftermovieUrl: asString(f["Aftermovie"] || f["aftermovieUrl"]),
        featured: Boolean(f["featured"]),
        heroTitle: asString(f["Hero Title"] || f["heroTitle"]),
        heroSubtitle: asString(f["Hero Subtitle"] || f["heroSubtitle"]),
        heroOnly: Boolean(f["HeroOnly"] ?? f["heroOnly"]),
        notes: asString(f["Notes"] || f["notes"]),
	deepdive_slug: Array.isArray(f["deepdive_slug"] || f["DeepDive Slug"])
  	? (f["deepdive_slug"] || f["DeepDive Slug"])
  	: (asString(f["deepdive_slug"] || f["DeepDive Slug"]) ? [asString(f["deepdive_slug"] || f["DeepDive Slug"])] : []),
	sponsors,
        phase: asString(
  	f["phase"] ||
  	f["Phase"] ||
  	(asString(f["status"] || f["Status"]).toLowerCase().includes("past")
    	? "past"
    	: "upcoming")
),

      };
    });
	return NextResponse.json(
  	{ ok: true, events },
  	{
    	status: 200,
    	headers: {
      "Cache-Control": "no-store, max-age=0",
    	},
  	}
	);
  } catch (e: any) {
    return jsonError(e?.message || "Unexpected error", 500);
  }
}
