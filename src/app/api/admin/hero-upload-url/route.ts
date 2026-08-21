import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickEnv(names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  throw new Error(`Missing env: tried ${names.join(", ")}`);
}

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

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const supabaseUrl = pickEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const serviceRole = pickEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE"]);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const bucket = "hero";
    const path = "hero.mp4";

    const { data, error } = await supabase.storage
  .from(bucket)
  .createSignedUploadUrl(path, {
    upsert: true,
  });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Signed upload URL error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      token: data.token,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Errore signed upload" },
      { status: 500 }
    );
  }
}
