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

function safeSlug(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await req.json().catch(() => null);
    const slug = safeSlug(body?.slug || "");

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
    }

    const supabaseUrl = pickEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const serviceRole = pickEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE"]);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const bucket = "lineup_video";
    const path = `deepdive/${slug}/${Date.now()}-promo.mp4`;

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, {
      upsert: false,
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
