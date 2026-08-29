import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      device_id?: string | null;
    };

    const token = String(body.token || "").trim();
    const deviceId = String(body.device_id || "").trim() || null;

    if (!token) return badRequest("Missing token");

    const supabase = supabaseAdmin();

    // 1) carica token (✅ colonne REALI)
    const { data: row, error: rErr } = await supabase
      .from("door_provision_tokens")
      .select("id, token, api_key, expires_at, max_uses, uses, device_id, used_at, label")
      .eq("token", token)
      .maybeSingle();

    if (rErr) throw new Error(rErr.message);
    if (!row) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });

    // 2) controlli scadenza / usi
    const now = Date.now();
    const exp = new Date((row as any).expires_at).getTime();
    if (!Number.isFinite(exp) || exp < now) {
      return NextResponse.json({ ok: false, error: "Token expired" }, { status: 410 });
    }

    const maxUses = Number((row as any).max_uses ?? 1);
    const uses = Number((row as any).uses ?? 0);
    if (uses >= maxUses) {
      return NextResponse.json({ ok: false, error: "Token already used" }, { status: 409 });
    }

    // 3) device binding (anti-condivisione)
    const storedDevice = String((row as any).device_id || "").trim() || null;

    // Se il token aveva device_id fissato, deve combaciare
    if (storedDevice && storedDevice !== deviceId) {
      return NextResponse.json({ ok: false, error: "Device mismatch" }, { status: 403 });
    }

    // Se token NON ha device_id e client lo manda: lo “blocchiamo” al primo uso
    const bindDeviceTo = !storedDevice && deviceId ? deviceId : storedDevice;

    // 4) consuma token (incrementa uses)
    const nextUses = uses + 1;

    const { data: consumed, error: uErr } = await supabase
      .from("door_provision_tokens")
      .update({
        uses: nextUses,
        used_at: nextUses >= maxUses ? new Date().toISOString() : (row as any).used_at,
        device_id: bindDeviceTo,
      })
      .eq("id", (row as any).id)
      .eq("uses", uses)
      .select("id")
      .maybeSingle();

    if (uErr) throw new Error(uErr.message);
    if (!consumed) {
      return NextResponse.json(
        { ok: false, error: "Token already used" },
        { status: 409 }
      );
    }

    // 5) ritorna la key (solo per installazione su device)
    const api_key = String((row as any).api_key || "").trim();
    if (!api_key) return NextResponse.json({ ok: false, error: "Missing api_key on token" }, { status: 500 });

    return NextResponse.json(
      {
        ok: true,
        api_key,
        label: (row as any).label || null,
        device_id: bindDeviceTo,
        expires_at: (row as any).expires_at,
        uses: nextUses,
        max_uses: maxUses,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
