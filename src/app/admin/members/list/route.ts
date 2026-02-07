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

function safeLike(q: string) {
  return `%${q.replace(/%/g, "\\%")}%`;
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: admin.code });

    const supabase = createClient(assertEnv("SUPABASE_URL"), assertEnv("SUPABASE_SERVICE_ROLE"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const status = String(searchParams.get("status") || "").trim(); // "ATTIVA" | "NON ATTIVA" | ""
    const limit = clampInt(searchParams.get("limit"), 200, 1, 500);
    const offset = clampInt(searchParams.get("offset"), 0, 0, 100000);

    let query = supabase
      .from("members")
      .select(
        "id, first_name, last_name, email, phone, codice_fiscale, legacy_barcode, status, updated_at, created_at",
        { count: "exact" }
      )
      .eq("legacy", true) // soci ETS importati
      .order("updated_at", { ascending: true });

    if (status && status.toLowerCase() !== "all") {
      query = query.eq("status", status);
    }

    if (q) {
      const like = safeLike(q);
      query = query.or(
        `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like},codice_fiscale.ilike.${like},legacy_barcode.ilike.${like}`
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      rows: data || [],
      count: Number(count || 0),
      limit,
      offset,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
