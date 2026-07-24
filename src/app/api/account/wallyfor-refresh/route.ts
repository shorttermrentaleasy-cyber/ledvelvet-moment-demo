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

  if (!url || !key) {
    throw new Error("Configurazione soci non disponibile.");
  }

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
  const barcode = String(body?.barcode || "").trim();

  if (!barcode) {
    return Response.json({ ok: false, error: "Barcode mancante." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, legacy_barcode")
      .ilike("email", email)
      .eq("legacy_barcode", barcode)
      .maybeSingle();

    if (memberError || !member) {
      return Response.json({ ok: false, error: "Tessera non associata al profilo." }, { status: 403 });
    }

    const { data: cached } = await supabase
      .from("wallyfor_members")
      .select("updated_at")
      .eq("barcode", barcode)
      .eq("source", "wallyfor_api")
      .maybeSingle();

    const lastUpdate = cached?.updated_at ? Date.parse(cached.updated_at) : 0;
    if (lastUpdate && Date.now() - lastUpdate < REFRESH_COOLDOWN_MS) {
      return Response.json({ ok: true, changed: false, skipped: true });
    }

    const matches = await findWallyforMembersByEmail(email);
    const fresh = matches.find((candidate) => candidate.barcode === barcode);

    if (!fresh) {
      return Response.json({ ok: true, changed: false, found: false });
    }

    const before = await supabase
      .from("wallyfor_members")
      .select("first_name, last_name, email, phone, membership_group, status, membership_expires_at")
      .eq("barcode", barcode)
      .eq("source", "wallyfor_api")
      .maybeSingle();

    const previous = before.data;
    const changed =
      !previous ||
      previous.first_name !== fresh.first_name ||
      previous.last_name !== fresh.last_name ||
      previous.email !== fresh.email ||
      previous.phone !== fresh.phone ||
      previous.membership_group !== fresh.membership_group ||
      previous.status !== fresh.status ||
      previous.membership_expires_at !== fresh.membership_expires_at;

    const now = new Date().toISOString();
    const { error: wallyforError } = await supabase
      .from("wallyfor_members")
      .upsert({
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
      }, { onConflict: "barcode" });

    if (wallyforError) throw wallyforError;

    const { error: memberUpdateError } = await supabase
      .from("members")
      .update({
        first_name: fresh.first_name,
        last_name: fresh.last_name,
        email: fresh.email,
        phone: fresh.phone,
        membership_group: fresh.membership_group,
        status: fresh.status || "DA VERIFICARE",
        membership_expires_at: fresh.membership_expires_at,
        updated_at: now,
      })
      .eq("id", member.id)
      .eq("legacy_barcode", barcode);

    if (memberUpdateError) throw memberUpdateError;

    return Response.json({ ok: true, changed, refreshedAt: now });
  } catch (error) {
    const status = error instanceof WallyforApiError ? 200 : 500;
    return Response.json(
      {
        ok: false,
        stale: true,
        error: "Aggiornamento Wallyfor non disponibile.",
      },
      { status }
    );
  }
}
