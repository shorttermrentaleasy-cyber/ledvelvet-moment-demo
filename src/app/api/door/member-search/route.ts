import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE as string,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, phone, membership_group, status")
      .or(`
        first_name.ilike.%${q}%,
        last_name.ilike.%${q}%,
        email.ilike.%${q}%,
        phone.ilike.%${q}%
      `)
      .limit(10);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}