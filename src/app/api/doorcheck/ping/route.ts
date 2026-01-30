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

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

async function isDoorApiKeyValid(supabase: ReturnType<typeof supabaseAdmin>, apiKey: string) {
  const k = (apiKey || "").trim();
  if (!k) return false;

  const { data, error } = await supabase
    .from("door_api_keys")
    .select("id")
    .eq("active", true)
    .eq("api_key", k)
    .limit(1);

  if (error) throw new Error(error.message);
  return !!(data && data.length > 0);
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const got = (req.headers.get("x-api-key") || "").trim();
    if (!got) return unauthorized("Missing API key");

    const ok = await isDoorApiKeyValid(supabase, got);
    if (!ok) return unauthorized("Invalid API key");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
