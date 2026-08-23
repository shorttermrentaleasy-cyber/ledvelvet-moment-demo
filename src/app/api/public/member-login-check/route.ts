import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4_096;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 6;
const attemptsByIp = new Map<string, number[]>();

function getAllowedAdmins() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    attemptsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return false;
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error("Missing TURNSTILE_SECRET_KEY");

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) return false;

  const result = (await response.json()) as { success?: boolean; action?: string };
  return result.success === true && (!result.action || result.action === "member_login");
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Richiesta troppo grande." }, { status: 413 });
  }

  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Richiesta troppo grande." }, { status: 413 });
  }

  let body: { email?: unknown; turnstileToken?: unknown } | null = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const turnstileToken = String(body?.turnstileToken || "").trim();

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Email non valida." }, { status: 400 });
  }

  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return Response.json({ ok: false, error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  }

  if (!turnstileToken || turnstileToken.length > 2_048) {
    return Response.json({ ok: false, error: "Verifica anti-bot richiesta." }, { status: 400 });
  }

  try {
    if (!(await verifyTurnstile(turnstileToken, clientIp))) {
      return Response.json({ ok: false, error: "Verifica anti-bot non valida." }, { status: 400 });
    }
  } catch {
    return Response.json({ ok: false, error: "Verifica socio non disponibile." }, { status: 500 });
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
    .from("members")
    .select("id")
    .ilike("email", email)
    .limit(1);

  if (error) {
    return Response.json({ ok: false, error: "Verifica socio non disponibile." }, { status: 500 });
  }

  return Response.json({ ok: true, allowed: Boolean(data?.length) });
}
