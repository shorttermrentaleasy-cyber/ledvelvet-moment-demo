import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

export async function GET() {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return json(false, { error: "Missing Airtable env" }, 500);
  }

  const url = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("Airtable meta error:", r.status, t);
    return json(false, { error: "Airtable meta error" }, 500);
  }

  const meta = await r.json();

  const table =
    meta?.tables?.find((t: any) => t?.name === "SPONSORS_REQUESTS") ||
    meta?.tables?.find((t: any) => String(t?.name || "").toLowerCase() === "sponsors_requests");

  if (!table) return json(false, { error: "SPONSORS_REQUESTS table not found" }, 500);

  const fields = table.fields || [];
  const interestField = fields.find((f: any) => f?.name === "interest type");

  const interestTypeOptions =
    interestField?.options?.choices
      ?.map((c: any) => ({ id: c.id, name: c.name, color: c.color }))
      ?.filter((x: any) => x?.name) || [];

  return json(true, { interestTypeOptions });
}
