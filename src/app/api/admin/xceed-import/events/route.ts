import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!allowed.includes(email)) {
    return NextResponse.json({ ok: false, error: "AccessDenied" }, { status: 403 });
  }
  return null;
}

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
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const supabase = supabaseAdmin();

    // Usa solo campi certi: id (uuid) + name
    const { data, error } = await supabase
      .from("events")
      .select("id,name")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, events: data ?? [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
