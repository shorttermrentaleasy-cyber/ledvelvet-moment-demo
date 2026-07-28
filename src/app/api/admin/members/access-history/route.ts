import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return { ok: false as const, code: 401 as const };

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) return { ok: false as const, code: 403 as const };
  return { ok: true as const };
}

function pickEvent(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  if (value && typeof value === "object") return value;
  return null;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: admin.code });
    }

    const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
    if (!barcode) {
      return NextResponse.json({ ok: false, error: "barcode_required" }, { status: 400 });
    }

    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("legacy_barcode", barcode)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const { data, error } = await supabase
      .from("checkins")
      .select(`
        id,
        checkin_at,
        created_at,
        result,
        reason,
        method,
        kind,
        events (
          name,
          city,
          venue,
          start_at
        )
      `)
      .eq("member_id", member.id)
      .order("checkin_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const rows = (data || []).map((row: any) => ({
      id: row.id,
      checkin_at: row.checkin_at,
      created_at: row.created_at,
      result: row.result,
      reason: row.reason,
      method: row.method,
      kind: row.kind,
      event: pickEvent(row.events),
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "server_error" },
      { status: 500 }
    );
  }
}
