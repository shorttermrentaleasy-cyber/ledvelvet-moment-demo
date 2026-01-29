import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminUnauthorized(message = "Unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return { ok: false as const, email: "" };

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) return { ok: false as const, email };
  return { ok: true as const, email };
}

function genKey(len = 28) {
  // evita caratteri ambigui, ma resta abbastanza "random"
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@*-_";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return adminUnauthorized("AccessDenied");

    const supabase = supabaseAdmin();

    // key attiva (se esiste)
    const { data: activeRow, error: aErr } = await supabase
      .from("door_api_keys")
      .select("id, label, api_key, active, created_at, revoked_at")
      .eq("active", true)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (aErr) throw new Error(aErr.message);

    // storico (ultime 20)
    const { data: history, error: hErr } = await supabase
      .from("door_api_keys")
      .select("id, label, active, created_at, revoked_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (hErr) throw new Error(hErr.message);

    return NextResponse.json({
      ok: true,
      active: activeRow
        ? {
            id: (activeRow as any).id,
            label: (activeRow as any).label,
            api_key: (activeRow as any).api_key,
            created_at: (activeRow as any).created_at,
          }
        : null,
      history: history || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return adminUnauthorized("AccessDenied");

    const supabase = supabaseAdmin();

    const body = (await req.json().catch(() => ({}))) as {
      label?: string;
      api_key?: string; // opzionale: key manuale
      rotate?: boolean; // opzionale
    };

    const label = String(body.label || "rotated").trim() || "rotated";
    const manual = String(body.api_key || "").trim();
    const nextKey = manual || genKey(28);

    // 1) disattiva tutte le key attive
    const { error: updErr } = await supabase
      .from("door_api_keys")
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq("active", true)
      .is("revoked_at", null);

    if (updErr) throw new Error(updErr.message);

    // 2) inserisce nuova key attiva
    const { data: ins, error: insErr } = await supabase
      .from("door_api_keys")
      .insert({
        label,
        api_key: nextKey,
        active: true,
        revoked_at: null,
      })
      .select("id, label, api_key, created_at")
      .maybeSingle();

    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({
      ok: true,
      active: {
        id: (ins as any)?.id || null,
        label: (ins as any)?.label || label,
        api_key: (ins as any)?.api_key || nextKey,
        created_at: (ins as any)?.created_at || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
