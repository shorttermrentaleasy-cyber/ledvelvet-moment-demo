import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { findWallyforMembersByEmail, WallyforApiError } from "@/lib/wallyfor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REFRESH_COOLDOWN_MS = 45_000;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) throw new Error("Configurazione soci non disponibile.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function fullName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();

  if (!email) {
    return Response.json({ ok: false, error: "Accesso richiesto." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { barcode?: unknown } | null;
  const requestedBarcode = String(body?.barcode || "").trim();

  try {
    const supabase = getSupabaseAdmin();

    if (requestedBarcode) {
      const { data: owned, error: ownedError } = await supabase
        .from("members")
        .select("id")
        .ilike("email", email)
        .eq("legacy_barcode", requestedBarcode)
        .maybeSingle();

      if (ownedError || !owned) {
        return Response.json({ ok: false, error: "Tessera non associata al profilo." }, { status: 403 });
      }
    }

    const { data: cached } = await supabase
      .from("wallyfor_members")
      .select("updated_at")
      .ilike("email", email)
      .eq("source", "wallyfor_api")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastUpdate = cached?.updated_at ? Date.parse(cached.updated_at) : 0;
    if (requestedBarcode && lastUpdate && Date.now() - lastUpdate < REFRESH_COOLDOWN_MS) {
      return Response.json({ ok: true, changed: false, skipped: true });
    }

    const freshMembers = await findWallyforMembersByEmail(email);
    if (freshMembers.length === 0) {
      return Response.json({ ok: true, changed: false, found: false, count: 0 });
    }

    const barcodes = freshMembers.map((member) => member.barcode);
    const { data: previousRows, error: previousError } = await supabase
      .from("wallyfor_members")
      .select("barcode, first_name, last_name, email, phone, membership_group, status, membership_expires_at")
      .in("barcode", barcodes)
      .eq("source", "wallyfor_api");
    if (previousError) throw previousError;

    const previousByBarcode = new Map((previousRows || []).map((row) => [row.barcode, row]));
    const changed = freshMembers.some((fresh) => {
      const previous = previousByBarcode.get(fresh.barcode);
      return !previous ||
        previous.first_name !== fresh.first_name ||
        previous.last_name !== fresh.last_name ||
        previous.email !== fresh.email ||
        previous.phone !== fresh.phone ||
        previous.membership_group !== fresh.membership_group ||
        previous.status !== fresh.status ||
        previous.membership_expires_at !== fresh.membership_expires_at;
    });

    const now = new Date().toISOString();
    const rows = freshMembers.map((fresh) => ({
      barcode: fresh.barcode,
      first_name: fresh.first_name,
      last_name: fresh.last_name,
      full_name: fullName(fresh.first_name, fresh.last_name),
      email: fresh.email,
      phone: fresh.phone,
      membership_group: fresh.membership_group,
      status: fresh.status || "DA VERIFICARE",
      membership_expires_at: fresh.membership_expires_at,
      raw: fresh.raw,
      source: "wallyfor_api",
      is_present: true,
      last_seen_at: now,
      missing_since: null,
      updated_at: now,
    }));

    const { error: wallyforError } = await supabase
      .from("wallyfor_members")
      .upsert(rows, { onConflict: "barcode" });
    if (wallyforError) throw wallyforError;

    const { error: membersSyncError } = await supabase.rpc("sync_wallyfor_to_members", {
      p_limit: Math.max(100, freshMembers.length + 10),
    });
    if (membersSyncError) throw membersSyncError;

    return Response.json({
      ok: true,
      changed,
      count: freshMembers.length,
      multiple: freshMembers.length > 1,
      refreshedAt: now,
    });
  } catch (error) {
    const status = error instanceof WallyforApiError ? 200 : 500;
    return Response.json(
      { ok: false, stale: true, error: "Aggiornamento Wallyfor non disponibile." },
      { status }
    );
  }
}
