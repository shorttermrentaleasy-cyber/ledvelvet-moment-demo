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
};

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function normalizePhone(raw: string) {
  const cleaned = String(raw || "").replace(/[^\d+\s()\-]/g, "").trim();
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
    meta?.tables?.find(
      (t: any) => String(t?.name || "").toLowerCase() === "sponsors_requests"
    );

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
    throw new Error("Airtable create failed");
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
    const raw = (await req.json()) as any;

	// compat: /moment manda brand/name/note
	const company = String(raw.company ?? raw.brand ?? "").trim();
	const contact = String(raw.contact ?? raw.name ?? "").trim();
	const email = String(raw.email ?? "").trim();
	const phoneRaw = String(raw.phone ?? "").trim();
	const budget = String(raw.budget ?? "").trim();
	const message = String(raw.message ?? raw.note ?? "").trim();
	const interestType = String(raw.interestType ?? raw["interest type"] ?? "").trim();
	const source = "website";

    // required
    if (!company) return json(false, { error: "Missing company" }, 400);
    if (!contact) return json(false, { error: "Missing contact" }, 400);
    if (!email) return json(false, { error: "Missing email" }, 400);
    if (!isValidEmail(email)) return json(false, { error: "Invalid email" }, 400);

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
    // "select" lo lasciamo vuoto (o lo mettiamo dopo quando ci dici le scelte esatte)
    const record = await createAirtableRecord({
      company,
      contact,
      email,
      phone: phone || "",
      budget: budget || "",
      message: message || "",
      "interest type": interestType || "",
      source,
    });

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
