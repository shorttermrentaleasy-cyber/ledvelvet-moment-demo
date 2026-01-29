import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAdminEmail(email: string) {
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.toLowerCase().trim());
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return { ok: false as const, res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminEmail(email))
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "AccessDenied" }, { status: 403 }) };
  return { ok: true as const, email };
}

function genKey() {
  // 32 bytes -> 64 hex chars (semplice da copiare e robusta)
  return crypto.randomBytes(32).toString("hex");
}

export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("door_api_keys")
      .select("id,label,api_key,active,created_at,revoked_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const active = (data || []).find((r: any) => r.active === true) || null;

    return NextResponse.json({
      ok: true,
      active,
      keys: data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

type PostBody =
  | { action: "rotate"; label?: string; api_key?: string } // crea nuova key e la rende active
  | { action: "revoke"; id: string } // revoke + disattiva
  | { action: "activate"; id: string }; // set active true su una esistente (disattiva altre)

export async function POST(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const body = (await req.json()) as PostBody;
    const supabase = supabaseAdmin();

    if (body.action === "rotate") {
      const label = (body.label || "rotated").toString().trim().slice(0, 80);
      const apiKey = (body.api_key || "").trim() || genKey();

      // 1) disattiva tutte
      const { error: offErr } = await supabase.from("door_api_keys").update({ active: false }).eq("active", true);
      if (offErr) throw new Error(offErr.message);

      // 2) inserisci nuova attiva
      const { data: ins, error: insErr } = await supabase
        .from("door_api_keys")
        .insert({ label, api_key: apiKey, active: true })
        .select("id,label,api_key,active,created_at,revoked_at")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      return NextResponse.json({ ok: true, active: ins });
    }

    if (body.action === "revoke") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

      const { error } = await supabase
        .from("door_api_keys")
        .update({ active: false, revoked_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw new Error(error.message);

      return NextResponse.json({ ok: true });
    }

    if (body.action === "activate") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

      // disattiva tutte
      const { error: offErr } = await supabase.from("door_api_keys").update({ active: false }).eq("active", true);
      if (offErr) throw new Error(offErr.message);

      // attiva questa (e se era revoked non tocchiamo revoked_at: scelta voluta “audit”)
      const { data: upd, error: updErr } = await supabase
        .from("door_api_keys")
        .update({ active: true })
        .eq("id", id)
        .select("id,label,api_key,active,created_at,revoked_at")
        .maybeSingle();

      if (updErr) throw new Error(updErr.message);

      return NextResponse.json({ ok: true, active: upd });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
