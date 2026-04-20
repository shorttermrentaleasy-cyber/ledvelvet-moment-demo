import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return { ok: false as const, code: 401 as const };

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) return { ok: false as const, code: 403 as const };
  return { ok: true as const, email };
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: admin.code }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const status = String(searchParams.get("status") || "all").trim();
    const limit = clampInt(searchParams.get("limit"), 200, 1, 500);
    const offset = clampInt(searchParams.get("offset"), 0, 0, 100000);

    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: { persistSession: false },
      }
    );

    const { data, error } = await supabase.rpc("search_members_admin", {
      p_q: q,
      p_status: status || "all",
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : [];
    const count = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      ok: true,
      rows,
      count,
      limit,
      offset,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}