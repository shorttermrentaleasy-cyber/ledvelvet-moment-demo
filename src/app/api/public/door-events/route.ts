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

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const onlyDated = searchParams.get("only_dated") === "1";
    const onlyFuture = searchParams.get("only_future") === "1";
    const q = (searchParams.get("q") || "").trim();
    const limit = clampInt(searchParams.get("limit"), 1000, 1, 2000); // 800/1000 ok

    let query = supabase
      .from("events")
      .select("id, name, starts_at, city, venue, xceed_event_ref, xceed_url, created_at")
      .limit(limit);

    if (onlyDated) query = query.not("starts_at", "is", null);

    if (onlyFuture) {
      // confronto in ISO (Supabase timestamptz ok)
      const nowIso = new Date().toISOString();
      query = query.gte("starts_at", nowIso);
    }

    if (q) {
      // ricerca su più campi (ilike)
      // NB: usa or() con sintassi Supabase
      const esc = q.replace(/,/g, "\\,");
      query = query.or(`name.ilike.%${esc}%,city.ilike.%${esc}%,venue.ilike.%${esc}%`);
    }

    // ✅ ordine alfabetico (come richiesto)
    query = query.order("name", { ascending: true }).order("starts_at", { ascending: true });

    const { data, error } = await query;
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
