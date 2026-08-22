import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SponsorPayload = {
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
  budget?: string;
  message?: string;
  interestType?: string; // UI key -> maps to Airtable "interest type"
  source?: string; // default "website"

  // ✅ GDPR flags (frontend -> backend)
  privacy_gdpr?: boolean; // required true
  marketing_optin?: boolean; // optional
  turnstileToken?: string;
  website?: string; // honeypot: deve restare vuoto
};

const MAX_BODY_BYTES = 16_384;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const attemptsByIp = new Map<string, number[]>();

const FIELD_LIMITS = {
  company: 120,
  contact: 120,
  email: 254,
  phone: 40,
  budget: 80,
  message: 2_000,
  interestType: 100,
} as const;

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
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
  return result.success === true && (!result.action || result.action === "sponsor_request");
}

function normalizePhone(raw: string) {
  const cleaned = String(raw || "")
    .replace(/[^\d+\s()\-]/g, "")
    .trim();
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!cleaned) return "";
  if (digits.length < 6) return ""; // troppo corto => invalido
  return cleaned;
}

async function getInterestTypeOptions() {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) return [];

  const url = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  if (!r.ok) return [];

  const meta: any = await r.json();
  const table =
    meta?.tables?.find((t: any) => t?.name === "SPONSORS_REQUESTS") ||
    meta?.tables?.find((t: any) => String(t?.name || "").toLowerCase() === "sponsors_requests");

  if (!table) return [];

  const fields = table.fields || [];
  const interestField = fields.find((f: any) => f?.name === "interest type");

  const options =
    interestField?.options?.choices
      ?.map((c: any) => c?.name)
      .filter(Boolean) || [];

  return options;
}

async function createAirtableRecord(fields: Record<string, any>) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLE = process.env.AIRTABLE_TABLE_SPONSOR_REQUESTS || "SPONSORS_REQUESTS";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) throw new Error("Missing Airtable env");

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  const text = await r.text();
  if (!r.ok) {
    console.error("Airtable create error:", r.status, text);
    try {
      const j = JSON.parse(text);
      throw new Error(j?.error?.message || j?.error || text || "Airtable create failed");
    } catch {
      throw new Error(text || "Airtable create failed");
    }
  }

  return JSON.parse(text);
}

async function sendResendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_FROM = process.env.EMAIL_FROM; // "Name <email@domain>" oppure "email@domain"
  if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  if (!EMAIL_FROM) throw new Error("Missing EMAIL_FROM");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("RESEND error:", r.status, t);
    throw new Error("Email send failed");
  }
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json(false, { error: "Request too large" }, 413);

    const bodyText = await req.text();
    if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
      return json(false, { error: "Request too large" }, 413);
    }

    let raw: SponsorPayload & Record<string, any>;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return json(false, { error: "Invalid JSON" }, 400);
    }

    if (String(raw.website || "").trim()) {
      return json(false, { error: "Request rejected" }, 400);
    }

    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
      return json(false, { error: "Too many requests. Riprova più tardi." }, 429);
    }

    const turnstileToken = String(raw.turnstileToken || "").trim();
    if (!turnstileToken || turnstileToken.length > 2_048) {
      return json(false, { error: "Verifica anti-bot richiesta" }, 400);
    }
    if (!(await verifyTurnstile(turnstileToken, clientIp))) {
      return json(false, { error: "Verifica anti-bot non valida. Riprova." }, 400);
    }

    // compat: /moment manda brand/name/note
    const company = String(raw.company ?? raw.brand ?? "").trim();
    const contact = String(raw.contact ?? raw.name ?? "").trim();
    const email = String(raw.email ?? "").trim();
    const phoneRaw = String(raw.phone ?? "").trim();
    const budget = String(raw.budget ?? "").trim();
    const message = String(raw.message ?? raw.note ?? "").trim();
    const interestType = String(raw.interestType ?? raw["interest type"] ?? "").trim();
    const source = "website";

    const values = { company, contact, email, phone: phoneRaw, budget, message, interestType };
    for (const [field, value] of Object.entries(values)) {
      const limit = FIELD_LIMITS[field as keyof typeof FIELD_LIMITS];
      if (value.length > limit) return json(false, { error: `${field} too long` }, 400);
    }

    // ✅ GDPR flags (accept both new keys and Airtable-ish keys)
    const privacy_gdpr = Boolean(raw.privacy_gdpr ?? raw.privacy ?? false);
    const marketing_optin = Boolean(raw.marketing_optin ?? raw.marketing ?? false);

    // required
    if (!company) return json(false, { error: "Missing company" }, 400);
    if (!contact) return json(false, { error: "Missing contact" }, 400);
    if (!email) return json(false, { error: "Missing email" }, 400);
    if (!isValidEmail(email)) return json(false, { error: "Invalid email" }, 400);

    // ✅ privacy mandatory (server-side)
    if (!privacy_gdpr) return json(false, { error: "Missing privacy consent" }, 400);

    // phone optional but must be valid if provided
    const phone = phoneRaw ? normalizePhone(phoneRaw) : "";
    if (phoneRaw && !phone) return json(false, { error: "Invalid phone" }, 400);

    // interest type optional but if provided must be one of Airtable choices (when available)
    if (interestType) {
      const options = await getInterestTypeOptions();
      if (options.length > 0 && !options.includes(interestType)) {
        return json(false, { error: "Invalid interest type" }, 400);
      }
    }

    // IMPORTANT: non scriviamo "Request ID" (formula) né "createdat" se è Created time (read-only)
    // "select" lo lasciamo vuoto
    const airtableFields: Record<string, any> = {
      company,
      contact,
      email,
      phone: phone || "",
      budget: budget || "",
      message: message || "",
      source,

      // ✅ map to Airtable checkbox fields you created
      privacy_gdpr: privacy_gdpr,
      marketing_optin: marketing_optin,
    };
    if (interestType) airtableFields["interest type"] = interestType;

    const record = await createAirtableRecord(airtableFields);

    // mail notify
    const notifyTo = process.env.SPONSOR_NOTIFY_TO;
    if (!notifyTo) throw new Error("Missing SPONSOR_NOTIFY_TO");

    const subject = `Nuova richiesta sponsor: ${company}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Nuova Sponsor Request</h2>
        <p><b>Company:</b> ${escapeHtml(company)}</p>
        <p><b>Contact:</b> ${escapeHtml(contact)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Phone:</b> ${escapeHtml(phone || "-")}</p>
        <p><b>Interest type:</b> ${escapeHtml(interestType || "-")}</p>
        <p><b>Budget:</b> ${escapeHtml(budget || "-")}</p>
        <p><b>Message:</b><br/>${escapeHtml(message || "-").replace(/\n/g, "<br/>")}</p>
        <p><b>Consent (privacy):</b> ${privacy_gdpr ? "YES" : "NO"}</p>
        <p><b>Marketing opt-in:</b> ${marketing_optin ? "YES" : "NO"}</p>
        <p><b>Source:</b> ${escapeHtml(source)}</p>
        <hr/>
        <p style="font-size:12px;color:#666">Airtable Record: ${escapeHtml(record?.id || "")}</p>
      </div>
    `;

    await sendResendEmail(notifyTo, subject, html);

    return json(true, { id: record?.id }, 200);
  } catch (err: any) {
    console.error("SPONSOR_REQUEST_ERROR:", err);
    return json(false, { error: err?.message || "Server error" }, 500);
  }
}
