import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET() {
  try {
    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE")
    );

    const { data, error } = await supabase
      .from("events")
      .select("id, name, starts_at, venue, city")
      .order("starts_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      events: data || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}