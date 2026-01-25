import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeFilename(name: string) {
  return name
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const form = await req.formData();
    const event_id = String(form.get("event_id") || "").trim();
    const file = form.get("file");

    if (!event_id) {
      return NextResponse.json({ ok: false, error: "Missing event_id" }, { status: 400 });
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    const filename = sanitizeFilename(file.name || "xceed_import");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `events/${event_id}/${ts}_${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: upErr } = await supabase.storage
      .from("xceed-imports")
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const { data: batch, error: bErr } = await supabase
      .from("xceed_import_batches")
      .insert({
        event_id,
        file_name: filename,
        file_path: path,
        status: "uploaded",
        rows_total: 0,
        rows_inserted: 0,
      })
      .select("id")
      .maybeSingle();

    if (bErr) {
      // rollback best-effort
      try {
        await supabase.storage.from("xceed-imports").remove([path]);
      } catch {}
      return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batch_id: batch?.id,
      file_path: path,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

// forza il file ad essere un "module" anche se qualche tool lo interpreta male
export {};
