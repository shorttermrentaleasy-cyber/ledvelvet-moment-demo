import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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

function genTokenHex(bytes = 24) {
  // 48 char hex, super stabile ovunque
  return randomBytes(bytes).toString("hex");
}

function baseUrlFromReq(req: Request) {
  const u = new URL(req.url);
  return u.origin;
}

type Body = {
  ttl_minutes?: number; // default 30
  label?: string;       // es "porta principale" (nome corretto in tabella)
  device_id?: string;   // es "ipad-ingresso-1"
};

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return adminUnauthorized("AccessDenied");

    const body = (await req.json().catch(() => ({}))) as Body;

    const ttl = Math.max(1, Math.min(180, Number(body.ttl_minutes ?? 30))); // clamp 1..180
    const label = String(body.label || "").trim().slice(0, 80) || null;
    const device_id = String(body.device_id || "").trim().slice(0, 80) || null;

    const token = genTokenHex(24);
    const expires_at = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    const supabase = supabaseAdmin();

    // ⚠️ NOTA CRITICA:
    // Se la tua tabella door_provision_tokens ha api_key NOT NULL,
    // qui devi valorizzarla (es. prendendo la Door API Key attiva da door_api_keys).
    //
    // Io faccio la cosa corretta: leggo la key attiva e la copio nel token.
    const { data: activeKey, error: kErr } = await supabase
      .from("door_api_keys")
      .select("id, api_key")
      .eq("active", true)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (kErr) throw new Error(kErr.message);
    const api_key = String((activeKey as any)?.api_key || "").trim();
    if (!api_key) throw new Error("No active door_api_keys found (cannot provision)");

    const api_key_id = (activeKey as any)?.id ?? null;

    const { data: ins, error: insErr } = await supabase
      .from("door_provision_tokens")
      .insert({
        token,
        label,          // ✅ nome colonna corretto (non device_label)
        device_id,
        created_by: admin.email,
        expires_at,
        api_key,        // ✅ richiesto dalla tua tabella (NOT NULL)
        api_key_id,     // opzionale, se c’è
        max_uses: 1,
        uses: 0,
      })
      .select("token, label, device_id, expires_at, created_at")
      .maybeSingle();

    if (insErr) throw new Error(insErr.message);

    const origin = baseUrlFromReq(req);
    const provisionPath = device_id
      ? `/doorcheck?provision=${encodeURIComponent(token)}&device_id=${encodeURIComponent(device_id)}`
      : `/doorcheck/provision?t=${encodeURIComponent(token)}`;
    const provision_url = `${origin}${provisionPath}`;

    return NextResponse.json({
      ok: true,
      token: ins?.token || token,
      label: (ins as any)?.label ?? label,
      device_id: (ins as any)?.device_id ?? device_id,
      expires_at: (ins as any)?.expires_at ?? expires_at,
      provision_url,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
