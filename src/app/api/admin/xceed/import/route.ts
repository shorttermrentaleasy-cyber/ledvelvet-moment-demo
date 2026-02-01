import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
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

    const filename = sanitizeFilename(file.name || "xceed_import.csv");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `events/${event_id}/${ts}_${filename}`;

    const buffer = new Uint8Array(await file.arrayBuffer());

    // 1️⃣ upload file
    const { error: uploadErr } = await supabase.storage
      .from("xceed-imports")
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) throw new Error(uploadErr.message);

    // 2️⃣ create batch record
    const { data: batch, error: batchErr } = await supabase
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
      .single();

    if (batchErr) throw new Error(batchErr.message);

    return NextResponse.json({
      ok: true,
      batch_id: batch.id,
      file_path: path,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

export {};
