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

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    // Prendiamo SOLO i campi minimi che servono al DoorCheck
    const { data, error } = await supabase
      .from("events")
      .select("id, name, starts_at, city, venue, xceed_event_ref, xceed_url")
      .order("starts_at", { ascending: false });

    if (error) throw new Error(error.message);

    const events = (data || []).map((e) => ({
      id: e.id, // UUID Supabase (fondamentale)
      name: e.name || "",
      starts_at: e.starts_at,
      city: e.city || "",
      venue: e.venue || "",
      xceed_event_ref: e.xceed_event_ref || null,
      xceed_url: e.xceed_url || null,
    }));

    return NextResponse.json({ ok: true, events });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
