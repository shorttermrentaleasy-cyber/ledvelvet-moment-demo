import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

    const SPONSOR_TABLE_NAME =
      process.env.AIRTABLE_TABLE_SPONSOR ||
      process.env.AIRTABLE_TABLE_SPONSORS ||
      "SPONSORS";

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { ok: false, error: "Missing Airtable env vars" },
        { status: 500 }
      );
    }

    const r = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        },
      }
    );

    const data = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "Airtable meta fetch failed", data },
        { status: r.status }
      );
    }

    const tables: any[] = Array.isArray(data.tables) ? data.tables : [];

    const table =
      tables.find(
        (t) =>
          String(t.name || "").toLowerCase() ===
          String(SPONSOR_TABLE_NAME).toLowerCase()
      ) ||
      tables.find((t) => String(t.name || "").toLowerCase() === "sponsors") ||
      tables.find((t) => String(t.name || "").toLowerCase() === "sponsor");

    if (!table || !Array.isArray(table.fields)) {
      return NextResponse.json(
        { ok: false, error: "Sponsors table not found in Airtable meta" },
        { status: 404 }
      );
    }

    const extract = (fieldName: string) => {
      const field = table.fields.find((f: any) => f.name === fieldName);
      const choices = field?.options?.choices || [];
      return choices.map((c: any) => ({
        id: c.id,
        label: c.name,
      }));
    };

    const status = extract("Status");
    const category = extract("Category");

    return NextResponse.json({
      ok: true,
      status,
      category,
      statuses: status.map((s: any) => s.label),
      categories: category.map((c: any) => c.label),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
