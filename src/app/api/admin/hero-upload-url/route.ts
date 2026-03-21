import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickEnv(names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  throw new Error(`Missing env: tried ${names.join(", ")}`);
}

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="LedVelvet Staging"',
    },
  });
}

function checkBasicAuth(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASS || "";

  if (!user || !pass) return true;

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;

  const b64 = auth.split(" ")[1] || "";
  let decoded = "";
  try {
    decoded = atob(b64);
  } catch {
    return false;
  }

  const [u, p] = decoded.split(":");
  return u === user && p === pass;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkBasicAuth(req)) return unauthorized();

    const supabaseUrl = pickEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const serviceRole = pickEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE"]);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const bucket = "hero";
    const path = "hero.mp4";

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

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