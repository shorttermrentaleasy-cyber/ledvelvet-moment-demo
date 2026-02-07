import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: admin.code });
    }

    // body opzionale (robusto)
    let body: any = {};
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    }

    const limitRaw = Number(body?.limit ?? 5000);
    const limit = Math.max(1, Math.min(20000, Number.isFinite(limitRaw) ? limitRaw : 5000));

    const supabase = createClient(assertEnv("SUPABASE_URL"), assertEnv("SUPABASE_SERVICE_ROLE"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Chiama la function SQL: sync_wallyfor_to_members(p_limit int)
    const { data, error } = await supabase.rpc("sync_wallyfor_to_members", { p_limit: limit });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // supabase può tornare array [{updated_count, inserted_count}] oppure oggetto
    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      updated_count: Number(row?.updated_count ?? 0),
      inserted_count: Number(row?.inserted_count ?? 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
