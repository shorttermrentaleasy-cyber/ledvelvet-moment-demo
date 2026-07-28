import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envOrThrow(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

function isAdmin(email?: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

function safePart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }
    const formData = await req.formData();
    const kind = String(formData.get("kind") || "");
    const title = String(formData.get("title") || "").trim();
    const file = formData.get("file");
    if (!title) {
      return NextResponse.json(
        { ok: false, error: "Inserisci prima il titolo del brano." },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "File mancante" }, { status: 400 });
    }

    const isAudio = kind === "audio";
    const valid = isAudio
      ? file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")
      : ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const max = isAudio ? 20 * 1024 * 1024 : 4 * 1024 * 1024;
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: isAudio ? "Usa un file MP3." : "Usa JPG, PNG o WEBP." },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > max) {
      return NextResponse.json(
        { ok: false, error: isAudio ? "MP3 massimo 20 MB." : "Immagine massimo 4 MB." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      envOrThrow("SUPABASE_URL"),
      process.env.SUPABASE_SERVICE_ROLE_KEY || envOrThrow("SUPABASE_SERVICE_ROLE"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const filename = safePart(file.name) || (isAudio ? "traccia.mp3" : "copertina.jpg");
    const path = `playlist/${kind}/${Date.now()}-${crypto.randomUUID()}-${filename}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from("lineup_video").upload(path, bytes, {
      contentType: isAudio ? "audio/mpeg" : file.type,
      upsert: false,
    });
    if (error) throw new Error(`Upload fallito: ${error.message}`);
    const url = supabase.storage.from("lineup_video").getPublicUrl(path).data.publicUrl;
    if (!url) throw new Error("URL del file non disponibile");
    return NextResponse.json({ ok: true, url, filename: file.name });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Caricamento fallito" },
      { status: 500 }
    );
  }
}
