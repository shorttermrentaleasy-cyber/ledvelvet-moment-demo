import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord<T> = { id: string; fields: T };

type Attachment = { url: string };

type DeepDiveFields = {
  slug?: string;
  event_ref?: string[];
  is_published?: boolean;
  event_date?: string;

  title_override?: string;
  subtitle?: string;

  hero_media_type?: "image" | "youtube" | "mp4";
  hero_image?: Attachment[];
  hero_youtube_url?: string;
  hero_mp4_url?: string;

  gallery?: Attachment[];

  concept?: string;

  atmosphere_sound?: string[];
  atmosphere_light?: string[];
  atmosphere_energy?: string[];

  place_story?: string;

  lineup_text?: string;
  invite_text?: string;

  cta_primary_label?: string;
  cta_secondary_label?: string;

  sort_order?: number;

  drive_folder_url?: string;
  hero_media_note?: string;
  gallery_note?: string;

  music_mood?: Attachment[];
};

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

async function airtableFetch<T>(path: string) {
  const token = envOrThrow("AIRTABLE_TOKEN");
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Airtable error (${res.status})`);
  return json as T;
}

const s = (v: any) => (v == null ? "" : String(v)).trim();
const arr = (v: any) => (Array.isArray(v) ? v : []);
const firstUrl = (atts?: Attachment[]) => (atts?.[0]?.url ? String(atts[0].url) : "");
const urls = (atts?: Attachment[]) => (Array.isArray(atts) ? atts.map((x) => x?.url).filter(Boolean) : []);

// ✅ Airtable formula string escaping (use single quotes and escape ')
function airtableFormulaString(v: string) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = s(url.searchParams.get("slug"));
    if (!slug) return jsonNoStore({ ok: false, error: "Missing slug" }, 400);

    const baseId = envOrThrow("AIRTABLE_BASE_ID");
    const deepTable = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";

    // ✅ safer formula + maxRecords=1
    const formula = `{slug} = ${airtableFormulaString(slug)}`;

    const dd = await airtableFetch<{ records: AirtableRecord<DeepDiveFields>[] }>(
      `${baseId}/${encodeURIComponent(deepTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`
    );

    const rec = dd.records?.[0];
    if (!rec?.fields) return jsonNoStore({ ok: false, error: "Not found" }, 404);

    const f = rec.fields;
    if (!f.is_published) return jsonNoStore({ ok: false, error: "Not published" }, 404);

    return jsonNoStore(
      {
        ok: true,
        deepdive: {
          // identity
          slug: s(f.slug),
          event_ref: arr(f.event_ref),
          event_date: s(f.event_date),

          // hero / titles
          title_override: s(f.title_override),
          subtitle: s(f.subtitle),

          hero_media_type: (f.hero_media_type || "image") as "image" | "youtube" | "mp4",
          hero_image_url: firstUrl(f.hero_image),
          hero_youtube_url: s(f.hero_youtube_url),
          hero_mp4_url: s(f.hero_mp4_url),

          // content
          concept: s(f.concept),
          place_story: s(f.place_story),
          lineup_text: s(f.lineup_text),
          invite_text: s(f.invite_text),

          // atmosphere
          atmosphere_sound: arr(f.atmosphere_sound),
          atmosphere_light: arr(f.atmosphere_light),
          atmosphere_energy: arr(f.atmosphere_energy),

          // gallery
          gallery_urls: urls(f.gallery),

          // mood audio (mp3 attachment)
          music_mood_url: firstUrl(f.music_mood),

          // optional extras
          cta_primary_label: s(f.cta_primary_label),
          cta_secondary_label: s(f.cta_secondary_label),
          sort_order: typeof f.sort_order === "number" ? f.sort_order : null,
          drive_folder_url: s(f.drive_folder_url),
          hero_media_note: s(f.hero_media_note),
          gallery_note: s(f.gallery_note),
        },
      },
      200
    );
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}

