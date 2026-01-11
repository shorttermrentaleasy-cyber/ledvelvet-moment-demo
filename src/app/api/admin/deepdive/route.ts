import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord<T> = { id: string; fields: T; createdTime?: string };

type DeepDiveFields = {
  slug?: string;
  is_published?: boolean;

  event_ref?: string[];
  venue_ref?: string[];
  event_date?: string;

  title_override?: string;
  subtitle?: string;

  sort_order?: number;
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

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error?.message || `Airtable error (${res.status})`);
  return json as T;
}

const s = (v: any) => (v == null ? "" : String(v)).trim();
const arr = (v: any) => (Array.isArray(v) ? v : []);

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Airtable pageSize must be 0..100
    const limitRaw = Number(url.searchParams.get("limit") || "100");
    const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 100, 1), 100);

    const baseId = envOrThrow("AIRTABLE_BASE_ID");
    const deepTable = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";

    // sort: event_date desc (most recent first)
    const query =
      `?pageSize=${limit}` +
      `&sort%5B0%5D%5Bfield%5D=event_date&sort%5B0%5D%5Bdirection%5D=desc` +
      `&sort%5B1%5D%5Bfield%5D=slug&sort%5B1%5D%5Bdirection%5D=asc`;

    const data = await airtableFetch<{ records: AirtableRecord<DeepDiveFields>[] }>(
      `${baseId}/${encodeURIComponent(deepTable)}${query}`
    );

    const items = (data.records || [])
      .map((r) => {
        const f = r.fields || ({} as DeepDiveFields);
        return {
          airtable_record_id: r.id,
          slug: s(f.slug),
          is_published: Boolean(f.is_published),
          event_ref: arr(f.event_ref),
          venue_ref: arr(f.venue_ref),
          event_date: s(f.event_date),
          title_override: s(f.title_override),
          subtitle: s(f.subtitle),
          sort_order: typeof f.sort_order === "number" ? f.sort_order : null,
        };
      })
      .filter((x) => x.slug);

    return jsonNoStore({ ok: true, items }, 200);
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}
