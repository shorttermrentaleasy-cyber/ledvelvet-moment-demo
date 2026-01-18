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

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: admin.code });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const status = (url.searchParams.get("status") || "all").trim();

    const supabase = createClient(assertEnv("SUPABASE_URL"), assertEnv("SUPABASE_SERVICE_ROLE"), {
      auth: { persistSession: false },
    });

    let query = supabase
      .from("wallyfor_members")
      // ✅ aggiungo raw per leggere telefono/cf lato UI
      .select("id, barcode, first_name, last_name, full_name, email, status, raw, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (status && status !== "all") query = query.eq("status", status);

    if (q) {
      const like = `%${q.replace(/%/g, "")}%`;
      query = query.or(
        `barcode.ilike.${like},full_name.ilike.${like},email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`
      );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, rows: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
