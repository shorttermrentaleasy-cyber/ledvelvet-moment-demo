import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  readFastCheckAccessToken,
  verifyFastCheckAccessToken,
} from "@/lib/door/fast-check-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function GET(request: Request) {
  try {
    const access = verifyFastCheckAccessToken(
      readFastCheckAccessToken(request)
    );

    if (!access) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || assertEnv("SUPABASE_URL");
    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      assertEnv("SUPABASE_SERVICE_ROLE");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [eventResult, gateResult, snapshotResult] = await Promise.all([
      supabase
        .from("events")
        .select("id,name,starts_at,venue,city")
        .eq("id", access.event_id)
        .maybeSingle(),
      supabase
        .from("door_gates")
        .select("gate_id,name,xceed_email,active")
        .eq("gate_id", access.gate_id)
        .maybeSingle(),
      supabase
        .from("event_gate_overrides")
        .select("scanner_email")
        .eq("event_id", access.event_id)
        .eq("gate_id", access.gate_id)
        .limit(1)
        .maybeSingle(),
    ]);

    if (eventResult.error) throw eventResult.error;
    if (gateResult.error) throw gateResult.error;
    if (snapshotResult.error) throw snapshotResult.error;

    if (!eventResult.data || !gateResult.data) {
      return NextResponse.json(
        { ok: false, error: "Fast Check context not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        event: eventResult.data,
        gate: {
          gate_id: gateResult.data.gate_id,
          name: gateResult.data.name,
          door_role: access.gate_role,
          xceed_email:
            snapshotResult.data?.scanner_email || gateResult.data.xceed_email,
          active: gateResult.data.active,
        },
        access_expires_at: new Date(access.expires_at * 1000).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
