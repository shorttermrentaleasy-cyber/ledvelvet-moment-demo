import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);
const ALLOWED_TYPES = new Set([
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!allowed.includes(email)) {
    return NextResponse.json({ ok: false, error: "AccessDenied" }, { status: 403 });
  }
  return null;
}

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
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > MAX_REQUEST_SIZE) {
      return NextResponse.json({ ok: false, error: "File troppo grande (max 10 MB)" }, { status: 413 });
    }

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

    const extension = file.name.toLowerCase().split(".").pop() || "";
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Formato non valido. Usa CSV, XLSX o XLS." },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: "File troppo grande (max 10 MB)" }, { status: 413 });
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
