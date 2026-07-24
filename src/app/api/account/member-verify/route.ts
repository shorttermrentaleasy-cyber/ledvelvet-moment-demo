import { createHmac, timingSafeEqual } from "crypto";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("39") && digits.length > 10 ? digits.slice(2) : digits;
}

function sign(email: string, barcode: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Configurazione accesso non disponibile.");
  return createHmac("sha256", secret).update(`${email}:${barcode}`).digest("hex");
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return Response.json({ ok: false, error: "Accesso richiesto." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { barcode?: unknown; phone?: unknown } | null;
  const barcode = String(body?.barcode || "").trim();
  const phone = normalizePhone(String(body?.phone || ""));
  if (!barcode || !phone) return Response.json({ ok: false, error: "Inserisci il cellulare." }, { status: 400 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return Response.json({ ok: false, error: "Servizio non disponibile." }, { status: 500 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase
    .from("wallyfor_members")
    .select("barcode, phone")
    .ilike("email", email)
    .eq("barcode", barcode)
    .eq("source", "wallyfor_api")
    .eq("is_present", true)
    .maybeSingle();

  const actual = normalizePhone(String(data?.phone || ""));
  if (error || !data || !actual || actual.length !== phone.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(phone))) {
    return Response.json({ ok: false, error: "Cellulare non corrispondente." }, { status: 403 });
  }

  const response = Response.json({ ok: true, href: `/lvpeople?barcode=${encodeURIComponent(barcode)}` });
  response.headers.append("Set-Cookie", `lv_member_access=${barcode}.${sign(email, barcode)}; Path=/lvpeople; HttpOnly; Secure; SameSite=Lax; Max-Age=900`);
  return response;
}
