import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE || assertEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ count: members, error: membersError }, { count: tickets, error: ticketsError }, { count: checkins, error: checkinsError }] = await Promise.all([
      supabase
        .from("wallyfor_members")
        .select("barcode", { count: "exact", head: true })
        .eq("source", "wallyfor_api")
        .eq("is_present", true),
      supabase
        .from("xceed_tickets")
        .select("event_id", { count: "exact", head: true })
        .in("status", ["active", "checked_in"]),
      supabase
        .from("xceed_tickets")
        .select("event_id", { count: "exact", head: true })
        .eq("status", "checked_in"),
    ]);

    if (membersError) throw membersError;
    if (ticketsError) throw ticketsError;
    if (checkinsError) throw checkinsError;

    const eventIds = new Set<string>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("xceed_tickets")
        .select("event_id")
        .in("status", ["active", "checked_in"])
        .range(from, from + pageSize - 1);

      if (error) throw error;
      for (const row of data || []) {
        const eventId = String(row.event_id || "").trim();
        if (eventId) eventIds.add(eventId);
      }
      if (!data || data.length < pageSize) break;
    }

    return NextResponse.json(
      {
        ok: true,
        metrics: {
          members: Number(members || 0),
          tickets: Number(tickets || 0),
          checkins: Number(checkins || 0),
          events: eventIds.size,
        },
        definitions: {
          members: "Soci presenti nella sincronizzazione Wallyfor",
          tickets: "Biglietti Xceed validi: active + checked_in",
          checkins: "Biglietti Xceed con stato checked_in",
          events: "Eventi distinti con almeno un biglietto Xceed valido",
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "metrics_unavailable" },
      { status: 500 }
    );
  }
}
