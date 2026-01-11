import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord<T> = { id: string; fields: T };
type Attachment = { url: string };

type DeepDiveFields = {
  slug?: string;
  is_published?: boolean;

  event_ref?: string[];
  venue_ref?: string[];
  event_date?: string;

  // READ-ONLY
  title_override?: string;

  // Optional editable title
  title_deepdive?: string;

  subtitle?: string;

  hero_media_type?: "image" | "youtube" | "mp4";
  hero_image?: Attachment[];
  hero_youtube_url?: string;
  hero_mp4_url?: string;

  gallery?: Attachment[];

  concept?: string;

  // ✅ now single select (string) or null
  atmosphere_sound?: string | null;
  atmosphere_light?: string | null;
  atmosphere_energy?: string | null;

  place_story?: string;

  lineup_text?: string;
  invite_text?: string;

  // keep read-only / or later
  cta_primary_label?: string;
  cta_secondary_label?: string;

  sort_order?: number | null;

  driver_folder_url?: string;

  hero_media_note?: string;
  gallery_note?: string;

  music_mood?: Attachment[];
};

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

async function airtableFetch<T>(path: string, init?: RequestInit) {
  const token = envOrThrow("AIRTABLE_TOKEN");
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error?.message || `Airtable error (${res.status})`;
    const err: any = new Error(msg);
    err._airtable = json;
    throw err;
  }
  return json as T;
}

const s = (v: any) => (v == null ? "" : String(v)).trim();
const b = (v: any) => Boolean(v);

function airtableFormulaString(v: string) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function findRecordBySlug(slug: string) {
  const baseId = envOrThrow("AIRTABLE_BASE_ID");
  const deepTable = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";
  const formula = `{slug} = ${airtableFormulaString(slug)}`;

  const data = await airtableFetch<{ records: AirtableRecord<DeepDiveFields>[] }>(
    `${baseId}/${encodeURIComponent(deepTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`
  );

  const rec = data.records?.[0];
  if (!rec?.id) return null;
  return { baseId, deepTable, rec };
}

// Parse: Unknown field name: "invite_text"
function parseUnknownFieldName(msg: string): string | null {
  const m = msg.match(/Unknown field name:\s*"([^"]+)"/i);
  if (m?.[1]) return m[1];
  const m2 = msg.match(/Unknown field name:\s*'([^']+)'/i);
  if (m2?.[1]) return m2[1];
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: { slug: string } }) {
  try {
    const slug = s(ctx?.params?.slug);
    if (!slug) return jsonNoStore({ ok: false, error: "Missing slug" }, 400);

    const found = await findRecordBySlug(slug);
    if (!found) return jsonNoStore({ ok: false, error: "Not found" }, 404);

    const f = found.rec.fields || {};

    return jsonNoStore(
      {
        ok: true,
        deepdive: {
          airtable_record_id: found.rec.id,
          slug: s(f.slug) || slug,

          is_published: b(f.is_published),
          event_ref: f.event_ref || [],
          event_date: s(f.event_date),

          title_override: s(f.title_override),

          title_deepdive: s(f.title_deepdive),
          subtitle: s(f.subtitle),

          hero_media_type: (f.hero_media_type || "image") as "image" | "youtube" | "mp4",
          hero_youtube_url: s(f.hero_youtube_url),
          hero_mp4_url: s(f.hero_mp4_url),

          concept: s(f.concept),
          place_story: s(f.place_story),
          lineup_text: s(f.lineup_text),
          invite_text: s(f.invite_text),

          // show current selected values
          atmosphere_sound: (f as any).atmosphere_sound ?? null,
          atmosphere_light: (f as any).atmosphere_light ?? null,
          atmosphere_energy: (f as any).atmosphere_energy ?? null,

          cta_primary_label: s(f.cta_primary_label),
          cta_secondary_label: s(f.cta_secondary_label),

          sort_order: typeof f.sort_order === "number" ? f.sort_order : null,
          driver_folder_url: s(f.driver_folder_url),

          hero_media_note: s(f.hero_media_note),
          gallery_note: s(f.gallery_note),

          hero_image_url: "Gestito in Media Manager",
          gallery_count: Array.isArray(f.gallery) ? f.gallery.length : 0,
          music_mood_url: "Gestito in Media Manager",
        },
      },
      200
    );
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { slug: string } }) {
  try {
    const slug = s(ctx?.params?.slug);
    if (!slug) return jsonNoStore({ ok: false, error: "Missing slug" }, 400);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonNoStore({ ok: false, error: "Invalid JSON body" }, 400);

    const found = await findRecordBySlug(slug);
    if (!found) return jsonNoStore({ ok: false, error: "Not found" }, 404);

    // ✅ whitelist only real fields (do NOT patch title_override)
    const fields: Record<string, any> = {};

    if ("is_published" in body) fields.is_published = Boolean(body.is_published);

    if ("title_deepdive" in body) fields.title_deepdive = s(body.title_deepdive);
    if ("subtitle" in body) fields.subtitle = s(body.subtitle);

    if ("hero_media_type" in body) {
      const v = s(body.hero_media_type);
      if (v === "image" || v === "youtube" || v === "mp4") fields.hero_media_type = v;
    }
    if ("hero_youtube_url" in body) fields.hero_youtube_url = s(body.hero_youtube_url);
    if ("hero_mp4_url" in body) fields.hero_mp4_url = s(body.hero_mp4_url);

    if ("concept" in body) fields.concept = s(body.concept);
    if ("place_story" in body) fields.place_story = s(body.place_story);
    if ("lineup_text" in body) fields.lineup_text = s(body.lineup_text);
    if ("invite_text" in body) fields.invite_text = s(body.invite_text);

    // ✅ single select: accept string or null to clear
    if ("atmosphere_sound" in body) {
      const v = body.atmosphere_sound;
      fields.atmosphere_sound = v == null || s(v) === "" ? null : s(v);
    }
    if ("atmosphere_light" in body) {
      const v = body.atmosphere_light;
      fields.atmosphere_light = v == null || s(v) === "" ? null : s(v);
    }
    if ("atmosphere_energy" in body) {
      const v = body.atmosphere_energy;
      fields.atmosphere_energy = v == null || s(v) === "" ? null : s(v);
    }

    if ("sort_order" in body) {
      const n = Number(body.sort_order);
      fields.sort_order = Number.isFinite(n) ? n : null;
    }

    if ("driver_folder_url" in body) fields.driver_folder_url = s(body.driver_folder_url);
    if ("hero_media_note" in body) fields.hero_media_note = s(body.hero_media_note);
    if ("gallery_note" in body) fields.gallery_note = s(body.gallery_note);

    // Remove undefined only (keep null!)
    for (const k of Object.keys(fields)) {
      if (fields[k] === undefined) delete fields[k];
    }

    if (Object.keys(fields).length === 0) {
      return jsonNoStore({ ok: true, no_op: true }, 200);
    }

    // Retry only for "Unknown field name"
    const ignored: string[] = [];
    let attempt = 0;

    while (attempt < 5) {
      attempt += 1;
      try {
        const updated = await airtableFetch<{ id: string; fields: DeepDiveFields }>(
          `${found.baseId}/${encodeURIComponent(found.deepTable)}/${encodeURIComponent(found.rec.id)}`,
          { method: "PATCH", body: JSON.stringify({ fields }) }
        );

        return jsonNoStore({ ok: true, deepdive: updated.fields, ignored_fields: ignored }, 200);
      } catch (e: any) {
        const msg = String(e?.message || "");
        const unknown = parseUnknownFieldName(msg);
        if (unknown && unknown in fields) {
          ignored.push(unknown);
          delete fields[unknown];

          if (Object.keys(fields).length === 0) {
            return jsonNoStore({ ok: true, no_op: true, ignored_fields: ignored }, 200);
          }
          continue;
        }
        throw e;
      }
    }

    return jsonNoStore({ ok: false, error: "PATCH failed after retries", ignored_fields: ignored }, 500);
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}
