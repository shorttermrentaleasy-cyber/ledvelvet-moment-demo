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
      console.log("MEMBERS LIST ROUTE VERSION TEST 21APR unauthorized");
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: admin.code }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const limit = clampInt(searchParams.get("limit"), 200, 1, 500);
    const offset = clampInt(searchParams.get("offset"), 0, 0, 100000);

    console.log("MEMBERS LIST ROUTE VERSION TEST 21APR", {
      q,
      status,
      limit,
      offset,
    });

    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: { persistSession: false },
      }
    );

    let baseQuery = supabase
      .from("members")
      .select(
        "id, legacy_barcode, first_name, last_name, email, phone, status, membership_group, membership_issued_at, membership_expires_at, membership_valid_year, legacy, updated_at",
        { count: "exact" }
      )
      .eq("legacy", true)
      .order("updated_at", { ascending: false });

    if (status && status !== "all") {
      baseQuery = baseQuery.eq("status", status);
    }

    if (q) {
      const nq = q.toLowerCase().trim().replace(/\s+/g, " ");

      const { data, error } = await baseQuery;

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      const filtered = (data || []).filter((row: any) => {
        const first = String(row.first_name || "").trim().toLowerCase();
        const last = String(row.last_name || "").trim().toLowerCase();
        const email = String(row.email || "").trim().toLowerCase();
        const phone = String(row.phone || "").trim().toLowerCase();
        const barcode = String(row.legacy_barcode || "").trim().toLowerCase();
        const group = String(row.membership_group || "").trim().toLowerCase();

        const haystack = [
          first,
          last,
          `${first} ${last}`.trim(),
          `${last} ${first}`.trim(),
          email,
          phone,
          barcode,
          group,
        ]
          .filter(Boolean)
          .join(" ");

        const terms = nq.split(" ").filter(Boolean);

        return terms.every((term) => haystack.includes(term));
      });

      console.log("MEMBERS LIST SEARCH RESULT 21APR", {
        q: nq,
        totalLoaded: Array.isArray(data) ? data.length : 0,
        filteredCount: filtered.length,
        sample: filtered.slice(0, 5).map((row: any) => ({
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          legacy_barcode: row.legacy_barcode,
          membership_group: row.membership_group,
        })),
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

    const { data, error, count } = await baseQuery.range(
      offset,
      offset + limit - 1
    );

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
    console.error("MEMBERS LIST ROUTE ERROR 21APR", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}