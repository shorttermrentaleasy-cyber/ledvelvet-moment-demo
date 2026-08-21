import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord<T> = { id: string; fields: T };

type HeroFields = {
  Title?: string;
  Subtitle?: string;
  Active?: boolean;

  videoUrl?: string;
  posterUrl?: string;
  imageUrl?: string;
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return jsonNoStore({ ok: false, error: "Unauthorized" }, 401);
  if (!allowed.includes(email)) {
    return jsonNoStore({ ok: false, error: "AccessDenied" }, 403);
  }
  return null;
}

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
  if (!res.ok) throw new Error((json as any)?.error?.message || `Airtable error (${res.status})`);
  return json as T;
}

const s = (v: any) => (v == null ? "" : String(v)).trim();

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function getHeroRecord() {
  const baseId = envOrThrow("AIRTABLE_BASE_ID");
  const heroTable = process.env.AIRTABLE_HERO_TABLE || "HERO";

  // prende il primo record (se hai 1 solo record hero, va benissimo)
  const data = await airtableFetch<{ records: AirtableRecord<HeroFields>[] }>(
    `${baseId}/${encodeURIComponent(heroTable)}?pageSize=1`
  );

  const rec = data.records?.[0];
  if (!rec) throw new Error("Hero record not found");
  return { baseId, heroTable, rec };
}

export async function GET() {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const { rec } = await getHeroRecord();
    return jsonNoStore(
      {
        ok: true,
        hero: {
          id: rec.id,
          fields: rec.fields,
        },
      },
      200
    );
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));

    const id = s(body?.id);
    if (!id) return jsonNoStore({ ok: false, error: "Missing id" }, 400);

    const fields: HeroFields = {
      Title: s(body?.title),
      Subtitle: s(body?.subtitle),
      Active: Boolean(body?.active),

      // ✅ NEW saved fields
      videoUrl: s(body?.videoUrl),
      posterUrl: s(body?.posterUrl),
      imageUrl: s(body?.imageUrl),
    };

    const baseId = envOrThrow("AIRTABLE_BASE_ID");
    const heroTable = process.env.AIRTABLE_HERO_TABLE || "HERO";

    const updated = await airtableFetch<AirtableRecord<HeroFields>>(
      `${baseId}/${encodeURIComponent(heroTable)}/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      }
    );

    return jsonNoStore(
      {
        ok: true,
        hero: {
          id: updated.id,
          fields: updated.fields,
        },
      },
      200
    );
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
}
