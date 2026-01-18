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

type ImportRow = {
  barcode: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  status?: string | null;
  raw?: any;
};

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: admin.code });

    const body = await req.json().catch(() => null);
    const rows = (body?.rows || []) as ImportRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "no_rows" }, { status: 400 });
    }

    // valida minimo: barcode
    const cleaned = rows
      .map((r) => ({
        barcode: String(r.barcode || "").trim(),
        first_name: r.first_name ? String(r.first_name).trim() : null,
        last_name: r.last_name ? String(r.last_name).trim() : null,
        full_name: r.full_name ? String(r.full_name).trim() : null,
        email: r.email ? String(r.email).trim() : null,
        status: r.status ? String(r.status).trim() : null,
        raw: r.raw ?? {},
      }))
      .filter((r) => r.barcode);

    if (cleaned.length === 0) {
      return NextResponse.json({ ok: false, error: "no_valid_rows" }, { status: 400 });
    }

    const supabase = createClient(assertEnv("SUPABASE_URL"), assertEnv("SUPABASE_SERVICE_ROLE"), {
      auth: { persistSession: false },
    });

    // Upsert su barcode (unique)
    const { error } = await supabase.from("wallyfor_members").upsert(cleaned, { onConflict: "barcode" });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, imported: cleaned.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
