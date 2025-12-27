import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
    return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_EVENTS
  )}?pageSize=50`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const text = await r.text();

  if (!r.ok) {
    console.error("Airtable events error:", r.status, text);
    return NextResponse.json({ ok: false, error: "Airtable error" }, { status: 500 });
  }

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  const records = (data.records || []).map((rec: any) => ({
    id: rec.id,
    fields: rec.fields,
  }));

  return NextResponse.json({ ok: true, records });
}
