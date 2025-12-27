import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(ok: boolean, payload: any, status = 200) {
  return NextResponse.json({ ok, ...payload }, { status });
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function airtableErrorMessage(details: any) {
  // Airtable tipicamente: { error: { type, message } } oppure { error: "..." }
  if (!details) return "Airtable error";
  if (typeof details?.error === "string") return details.error;
  if (details?.error?.message) return details.error.message;
  if (details?.message) return details.message;
  return "Airtable error";
}

function normalizeSponsor(record: any) {
  const f = record?.fields || {};
  const logo = f["Logo"];
  const logoUrl = Array.isArray(logo) && logo[0]?.url ? logo[0].url : "";

  return {
    id: record.id,
    sponsorId: f["SponsorID"] ?? "",
    brandName: f["Brand Name"] ?? "",
    category: f["Category"] ?? "",
    website: f["WebSite"] ?? "",
    email: f["Email"] ?? "",
    phone: f["Phone"] ?? "",
    status: f["Status"] ?? "",
    notes: f["Notes"] ?? "",
    logoUrl,
  };
}

async function airtableFetch(url: string, init?: RequestInit) {
  const AIRTABLE_TOKEN = requireEnv("AIRTABLE_TOKEN");
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    if (!id) return json(false, { error: "Missing id" }, 400);

    const AIRTABLE_BASE_ID = requireEnv("AIRTABLE_BASE_ID");
    const AIRTABLE_TABLE_SPONSOR = requireEnv("AIRTABLE_TABLE_SPONSOR");

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_SPONSOR)}/${id}`;
    const r = await airtableFetch(url);

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(false, { error: airtableErrorMessage(data), details: data }, r.status);

    return json(true, { sponsor: normalizeSponsor(data) });
  } catch (e: any) {
    return json(false, { error: e?.message || "Server error" }, 500);
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    if (!id) return json(false, { error: "Missing id" }, 400);

    const body = await req.json().catch(() => ({}));

    const AIRTABLE_BASE_ID = requireEnv("AIRTABLE_BASE_ID");
    const AIRTABLE_TABLE_SPONSOR = requireEnv("AIRTABLE_TABLE_SPONSOR");

    // mappa UI -> Airtable fields
    const fields: Record<string, any> = {};
    if (body.brandName !== undefined) fields["Brand Name"] = body.brandName;
    if (body.category !== undefined) fields["Category"] = body.category;
    if (body.website !== undefined) fields["WebSite"] = body.website;
    if (body.email !== undefined) fields["Email"] = body.email;
    if (body.phone !== undefined) fields["Phone"] = body.phone;
    if (body.status !== undefined) fields["Status"] = body.status;
    if (body.notes !== undefined) fields["Notes"] = body.notes;

    // Se non c’è nulla da aggiornare, non chiamare Airtable
    if (Object.keys(fields).length === 0) return json(true, { sponsor: { id } });

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_SPONSOR)}/${id}`;
    const r = await airtableFetch(url, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(false, { error: airtableErrorMessage(data), details: data }, r.status);

    return json(true, { sponsor: normalizeSponsor(data) });
  } catch (e: any) {
    return json(false, { error: e?.message || "Server error" }, 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    if (!id) return json(false, { error: "Missing id" }, 400);

    const AIRTABLE_BASE_ID = requireEnv("AIRTABLE_BASE_ID");
    const AIRTABLE_TABLE_SPONSOR = requireEnv("AIRTABLE_TABLE_SPONSOR");

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_SPONSOR)}/${id}`;
    const r = await airtableFetch(url, { method: "DELETE" });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(false, { error: airtableErrorMessage(data), details: data }, r.status);

    return json(true, {});
  } catch (e: any) {
    return json(false, { error: e?.message || "Server error" }, 500);
  }
}
