import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRec = { id: string; fields: Record<string, any> };

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json(ok ? { ok: true, ...data } : { ok: false, ...data }, { status });
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return { ok: false, error: "Unauthorized" };

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) return { ok: false, error: "AccessDenied" };
  return { ok: true, email };
}

function getEnv() {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_HERO = process.env.AIRTABLE_TABLE_HERO || "HERO";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { ok: false as const, error: "Missing Airtable env (AIRTABLE_TOKEN/AIRTABLE_BASE_ID)" };
  }

  return { ok: true as const, AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_HERO };
}

async function airtableFetch(url: string, token: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const j = await r.json().catch(() => ({}));
  return { r, j };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return json(false, { error: auth.error }, auth.error === "AccessDenied" ? 403 : 401);

  const env = getEnv();
  if (!env.ok) return json(false, { error: env.error }, 500);

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_HERO } = env;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_HERO
  )}?pageSize=1`;

  const { r, j } = await airtableFetch(url, AIRTABLE_TOKEN);
  if (!r.ok) return json(false, { error: j?.error?.message || "Airtable error" }, 500);

  const rec: AirtableRec | undefined = (j.records || [])[0];
  if (!rec) return json(false, { error: "No HERO record found" }, 404);

  return json(true, { hero: rec }, 200);
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return json(false, { error: auth.error }, auth.error === "AccessDenied" ? 403 : 401);

  const env = getEnv();
  if (!env.ok) return json(false, { error: env.error }, 500);

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_HERO } = env;

  const body = await req.json().catch(() => ({}));
  const id = (body?.id || "").toString().trim();
  if (!id) return json(false, { error: "Missing hero id" }, 400);

  const title = (body?.title ?? "").toString();
  const subtitle = (body?.subtitle ?? "").toString();
  const active = !!body?.active;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_HERO
  )}/${id}`;

  const payload = {
    fields: {
      // ATTENZIONE: questi nomi devono combaciare coi campi Airtable
      Title: title,
      Subtitle: subtitle,
      Active: active,
    },
  };

  const { r, j } = await airtableFetch(url, AIRTABLE_TOKEN, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (!r.ok) return json(false, { error: j?.error?.message || "Airtable error" }, 500);

  return json(true, { hero: j }, 200);
}
