import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const got = (req.headers.get("x-api-key") || "").trim();
    if (!got) {
      return NextResponse.json({ ok: false, error: "Missing API key" }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("door_api_keys")
      .select("id")
      .eq("api_key", got)
      .eq("active", true)
      .limit(1);

    if (error || !data || data.length === 0) {
      return NextResponse.json({ ok: false, error: "Invalid API key" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
