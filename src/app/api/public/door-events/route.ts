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

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();

    // opzionale: se vuoi includere solo eventi "con data", puoi usare ?only_dated=1
    const { searchParams } = new URL(req.url);
    const onlyDated = searchParams.get("only_dated") === "1";

    let q = supabase
      .from("events")
      .select("id, name, starts_at, city, venue, xceed_event_ref, xceed_url, created_at")
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (onlyDated) q = q.not("starts_at", "is", null);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const events = (data || []).map((e: any) => ({
      id: e.id,
      name: e.name || "",
      starts_at: e.starts_at,
      city: e.city || "",
      venue: e.venue || "",
      xceed_event_ref: e.xceed_event_ref || null,
      xceed_url: e.xceed_url || null,
    }));

    return NextResponse.json(
      { ok: true, events },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
