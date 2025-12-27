import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return json(500, { ok: false, error: "Missing Airtable env" });
    }

    const r = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        cache: "no-store",
      }
    );

    const data = await r.json();
    const table = (data.tables || []).find((t: any) => t.name === "SPONSOR");
    if (!table) return json(500, { ok: false, error: "Table SPONSOR not found in meta" });

    const toOptions = (fieldName: string) => {
      const choices = table.fields.find((f: any) => f.name === fieldName)?.options?.choices || [];
      return choices.map((c: any) => ({ id: c.id, label: c.name }));
    };

    const status = toOptions("Status");
    const category = toOptions("Category");

    return json(200, { ok: true, status, category });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: "Server error" });
  }
}
