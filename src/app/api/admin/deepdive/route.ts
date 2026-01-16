import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

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

type EventFields = {
  "Event Name"?: string;
  date?: string;
  Status?: string;
};

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return jsonNoStore({ ok: false, error: "Unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const mode = s(url.searchParams.get("mode"));

    // Airtable pageSize must be 1..100
    const limitRaw = Number(url.searchParams.get("limit") || "100");
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 100);

    const baseId = envOrThrow("AIRTABLE_BASE_ID");

    // ✅ MODE: events -> serve SOLO per la dropdown "event_ref"
    if (mode === "events") {
      // usa la stessa env che usi nel resto dell’admin events
      const eventsTable = process.env.AIRTABLE_TABLE_EVENTS || process.env.AIRTABLE_EVENTS_TABLE || "EVENTS";

      // ⚠️ IMPORTANTISSIMO: il campo si chiama "Event Name", NON "Name"
      const query =
        `?pageSize=${limit}` +
        `&sort%5B0%5D%5Bfield%5D=Event%20Name&sort%5B0%5D%5Bdirection%5D=asc`;

      const data = await airtableFetch<{ records: AirtableRecord<EventFields>[] }>(
        `${baseId}/${encodeURIComponent(eventsTable)}${query}`
      );

      const items = (data.records || [])
        .map((r) => ({
          id: r.id,
          name: s(r.fields?.["Event Name"]) || `Event ${r.id.slice(0, 6)}`,
        }))
        .filter((x) => x.name);

      return jsonNoStore({ ok: true, items }, 200);
    }

    // ✅ DEFAULT: lista experiences
    const deepTable = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";

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

// ✅ POST: crea Experience MINIMA: event_ref + is_published
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return jsonNoStore({ ok: false, error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => null);
    const eventId = s(body?.eventId);
    const is_published = Boolean(body?.is_published);

    if (!eventId) return jsonNoStore({ ok: false, error: "Missing eventId" }, 400);

    const token = envOrThrow("AIRTABLE_TOKEN");
    const baseId = envOrThrow("AIRTABLE_BASE_ID");
    const deepTable = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";

    const createUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(deepTable)}`;

    const fields: Record<string, any> = {
      // Airtable compila slug / rollup / lookup via formula/links
      event_ref: [eventId],
      is_published,
    };

    const r = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    const txt = await r.text();
    if (!r.ok) return jsonNoStore({ ok: false, error: "Create failed", detail: txt }, 500);

    const created = JSON.parse(txt);
    return jsonNoStore({ ok: true, id: created?.id, record: created }, 200);
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}
