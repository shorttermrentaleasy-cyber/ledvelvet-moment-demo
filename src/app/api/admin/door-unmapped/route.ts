import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("door_unmapped_xceed_emails")
      .select("*")
      .eq("resolved", false)
      .order("last_seen_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: data || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "unknown error" },
      { status: 500 }
    );
  }
}