import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  readFastCheckAccessToken,
  verifyFastCheckAccessToken,
} from "@/lib/door/fast-check-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 🔐 Env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or Supabase service role"
  );
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
    const access = verifyFastCheckAccessToken(
      readFastCheckAccessToken(req)
    );
    if (!access) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = supabaseAdmin;

    const { searchParams } = new URL(req.url);
    const eventId = String(searchParams.get("eventId") || "").trim();
    const gateId = String(searchParams.get("gateId") || "").trim();
    if (!eventId || !gateId) {
      return NextResponse.json(
        { ok: false, error: "Missing eventId or gateId" },
        { status: 400 }
      );
    }

    if (access.event_id !== eventId || access.gate_id !== gateId) {
      return NextResponse.json(
        { ok: false, error: "AccessDenied" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

let query = supabase
  .from("door_live_events")
  .select(
    "id, event_id, gate_id, door_role, device_label, live_key, ticket_id, ticket_qr_code, payload_json, created_at"
  )
  .eq("event_id", eventId)
  .order("created_at", { ascending: false })
  .limit(1);

if (gateId) {
  query = query.eq("gate_id", gateId);
}

const { data, error } = await query.maybeSingle();


    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        item: data || null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
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
