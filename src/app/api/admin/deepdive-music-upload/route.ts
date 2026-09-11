import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { airtableFormulaString } from "@/lib/airtable-formula";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function envOrThrow(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

function isAdmin(email?: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(normalized && allowed.includes(normalized));
}

function safePart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function deepDiveExists(slug: string) {
  const baseId = envOrThrow("AIRTABLE_BASE_ID");
  const token = envOrThrow("AIRTABLE_TOKEN");
  const table = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";
  const formula = `{slug} = ${airtableFormulaString(slug)}`;
  const url =
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}` +
    `?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Verifica Experience fallita");
  const json = await response.json().catch(() => null);
  return Boolean(json?.records?.[0]?.id);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const slug = String(body?.slug || "").trim();
    const filename = String(body?.filename || "").trim();
    const contentType = String(body?.contentType || "").trim().toLowerCase();
    const size = Number(body?.size || 0);

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Slug mancante" }, { status: 400 });
    }
    if (!filename) {
      return NextResponse.json({ ok: false, error: "Nome file mancante" }, { status: 400 });
    }
    if (contentType !== "audio/mpeg" && !filename.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json(
        { ok: false, error: "Formato non valido. Usa un file MP3." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "Il file MP3 deve essere inferiore a 20 MB." },
        { status: 400 }
      );
    }
    if (!(await deepDiveExists(slug))) {
      return NextResponse.json({ ok: false, error: "Experience non trovata" }, { status: 404 });
    }

    const supabase = createClient(
      envOrThrow("SUPABASE_URL"),
      process.env.SUPABASE_SERVICE_ROLE_KEY || envOrThrow("SUPABASE_SERVICE_ROLE"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const bucket = "lineup_video";
    const storageSlug = safePart(slug) || "experience";
    const storageFilename = safePart(filename) || "musica.mp3";
    const path = `deepdive/${storageSlug}/music/${Date.now()}-${crypto.randomUUID()}-${storageFilename}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, {
      upsert: false,
    });
    if (error) throw new Error(`Autorizzazione upload fallita: ${error.message}`);

    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    if (!publicUrl) throw new Error("Indirizzo della musica non disponibile");

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      token: data.token,
      url: publicUrl,
      filename,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Caricamento fallito" },
      { status: 500 }
    );
  }
}
