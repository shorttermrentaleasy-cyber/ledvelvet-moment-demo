import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

function airtableFormulaString(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
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

    const formData = await req.formData();
    const slug = safePart(String(formData.get("slug") || ""));
    const file = formData.get("file");

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Slug mancante" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "File mancante" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Formato non valido. Usa JPG, PNG, WEBP o GIF." },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "La foto deve essere inferiore a 4 MB." },
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
    const filename = safePart(file.name) || "foto.jpg";
    const path = `deepdive/${slug}/gallery/${Date.now()}-${crypto.randomUUID()}-${filename}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Upload fallito: ${error.message}`);

    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    if (!publicUrl) throw new Error("Indirizzo della foto non disponibile");

    return NextResponse.json({ ok: true, url: publicUrl, filename: file.name });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Caricamento fallito" },
      { status: 500 }
    );
  }
}
