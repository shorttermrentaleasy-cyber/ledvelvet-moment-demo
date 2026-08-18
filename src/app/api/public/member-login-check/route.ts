import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getAllowedAdmins() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Email non valida." }, { status: 400 });
  }

  if (getAllowedAdmins().includes(email)) {
    return Response.json({ ok: true, allowed: true });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    return Response.json({ ok: false, error: "Verifica socio non disponibile." }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("wallyfor_members")
    .select("barcode")
    .ilike("email", email)
    .eq("source", "wallyfor_api")
    .eq("is_present", true)
    .limit(1);

  if (error) {
    return Response.json({ ok: false, error: "Verifica socio non disponibile." }, { status: 500 });
  }

  return Response.json({ ok: true, allowed: Boolean(data?.length) });
}
