import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔐 Env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
}

// ✅ Client admin (fix TS + stabilità runtime)
const supabaseAdmin = createClient(
  SUPABASE_URL as string,
  SUPABASE_SERVICE_ROLE as string,
  {
    auth: { persistSession: false },
  }
);

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin;

    const { searchParams } = new URL(req.url);
    const eventId = String(searchParams.get("eventId") || "").trim();
    const gateId = String(searchParams.get("gateId") || "default").trim();

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Missing eventId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("door_live_events")
      .select(
        "id, event_id, gate_id, live_key, ticket_id, ticket_qr_code, payload_json, created_at"
      )
      .eq("event_id", eventId)
      .eq("gate_id", gateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: data || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}