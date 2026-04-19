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

    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const limit = clampInt(searchParams.get("limit"), 200, 1, 500);
    const offset = clampInt(searchParams.get("offset"), 0, 0, 100000);

    if (q) {
      const nq = q.trim().toLowerCase().replace(/\s+/g, " ");

      let searchQuery = supabase
        .from("members")
        .select(
          "id, first_name, last_name, email, phone, codice_fiscale, legacy_barcode, status, membership_group, updated_at, created_at",
          { count: "exact" }
        )
        .eq("legacy", true)
        .order("updated_at", { ascending: true });

      if (status && status.toLowerCase() !== "all") {
        searchQuery = searchQuery.eq("status", status);
      }

      const { data, error } = await searchQuery;

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      const filtered = (data || []).filter((row: any) => {
        const first = String(row.first_name || "").trim().toLowerCase();
        const last = String(row.last_name || "").trim().toLowerCase();
        const full1 = `${first} ${last}`.trim();
        const full2 = `${last} ${first}`.trim();

        const email = String(row.email || "").trim().toLowerCase();
        const phone = String(row.phone || "").trim().toLowerCase();
        const cf = String(row.codice_fiscale || "").trim().toLowerCase();
        const barcode = String(row.legacy_barcode || "").trim().toLowerCase();

        return (
          first.includes(nq) ||
          last.includes(nq) ||
          full1.includes(nq) ||
          full2.includes(nq) ||
          email.includes(nq) ||
          phone.includes(nq) ||
          cf.includes(nq) ||
          barcode.includes(nq)
        );
      });

      const sliced = filtered.slice(offset, offset + limit);

      return NextResponse.json({
        ok: true,
        rows: sliced,
        count: filtered.length,
        limit,
        offset,
      });
    }

    let query = supabase
      .from("members")
      .select(
        "id, first_name, last_name, email, phone, codice_fiscale, legacy_barcode, status, membership_group, updated_at, created_at",
        { count: "exact" }
      )
      .eq("legacy", true)
      .order("updated_at", { ascending: true });

    if (status && status.toLowerCase() !== "all") {
      query = query.eq("status", status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      rows: data || [],
      count: Number(count || 0),
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