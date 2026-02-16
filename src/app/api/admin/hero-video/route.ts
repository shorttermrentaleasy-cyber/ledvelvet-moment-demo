import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function pickEnv(names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  throw new Error(`Missing env: tried ${names.join(", ")}`);
}

function withCacheBuster(url: string, stamp?: number) {
  const u = (url || "").trim();
  if (!u) return "";
  const sep = u.includes("?") ? "&" : "?";
  // se già ha v=, rimpiazza
  if (/\bv=\d+\b/.test(u)) {
    return u.replace(/\bv=\d+\b/, `v=${stamp ?? Date.now()}`);
  }
  return `${u}${sep}v=${stamp ?? Date.now()}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const heroId = String(form.get("heroId") || "").trim();

    if (!heroId) return NextResponse.json({ ok: false, error: "heroId mancante" }, { status: 400 });
    if (!file) return NextResponse.json({ ok: false, error: "file mancante" }, { status: 400 });
    if (!file.type.includes("video")) {
      return NextResponse.json({ ok: false, error: "File non valido: carica un video (MP4)." }, { status: 400 });
    }

    const supabaseUrl = pickEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const serviceRole = pickEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE"]);

    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    const bytes = Buffer.from(await file.arrayBuffer());

    const bucket = "hero";
    const objectPath = "hero.mp4";

    const up = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      contentType: file.type || "video/mp4",
      upsert: true,
      cacheControl: "0", // ✅ importantissimo: non 3600
    });

    if (up.error) throw new Error(`Supabase upload error: ${up.error.message}`);

    // public url (bucket deve essere PUBLIC)
    const pub = supabase.storage.from(bucket).getPublicUrl(objectPath);
    const basePublicUrl = pub.data.publicUrl;
    if (!basePublicUrl) throw new Error("Impossibile ottenere publicUrl (bucket non public?)");

    // ✅ url che cambia ad ogni upload (anti-cache)
    const videoUrl = withCacheBuster(basePublicUrl, Date.now());

    // aggiorna Airtable HERO via endpoint già esistente
    const baseUrl = new URL(req.url);
    const patchUrl = new URL("/api/admin/hero", baseUrl.origin);

    const pr = await fetch(patchUrl.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: heroId, videoUrl }),
      cache: "no-store",
    });

    const pj = await pr.json().catch(() => ({}));
    if (!pr.ok || pj?.ok === false) {
      // upload è ok, ma non siamo riusciti a sincronizzare airtable
      return NextResponse.json(
        { ok: false, error: pj?.error || "Upload ok, ma sync HERO fallito", videoUrl },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, videoUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Errore upload" }, { status: 500 });
  }
}
