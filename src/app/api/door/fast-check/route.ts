import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalize(value: unknown) {
  return String(value || "").trim();
}

function jsonFast(ok: boolean) {
  return NextResponse.json(
    { ok },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const eventId = normalize(body.event_id);
    const code = normalize(body.code);

    if (!eventId || !code) {
      return jsonFast(false);
    }

    const supabase = createClient(
      assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE")
    );

    const { data: ticket, error } = await supabase
      .from("xceed_tickets")
      .select("id")
      .eq("event_id", eventId)
      .eq("qr_code", code)
      .maybeSingle();

    if (error) {
      console.error("FAST_CHECK_ERROR", error);
      return jsonFast(false);
    }

    return jsonFast(!!ticket);
  } catch (err) {
    console.error("FAST_CHECK_FATAL", err);
    return jsonFast(false);
  }
}