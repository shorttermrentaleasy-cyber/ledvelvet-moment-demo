import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json(false, { error: "Unauthorized" }, 401);

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return json(false, { error: "Missing Airtable env" }, 500);
  }

  // Airtable Metadata API
  // NOTA: richiede scopes corretti sul token (schema/metadata).
  const url = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const text = await r.text();
  if (!r.ok) {
    console.error("Airtable meta error:", r.status, text);
    return json(false, { error: "Airtable meta error" }, 500);
  }

  const meta = JSON.parse(text);

  // Trova tabella EVENTS
  const eventsTable =
    (meta?.tables || []).find((t: any) => t?.name === "EVENTS") ||
    (meta?.tables || []).find((t: any) => String(t?.name || "").toLowerCase() === "events");

  if (!eventsTable) return json(false, { error: "EVENTS table not found" }, 500);

  const fields = eventsTable.fields || [];

  const statusField = fields.find((f: any) => f?.name === "Status");
  const ticketPlatformField = fields.find((f: any) => f?.name === "Ticket Platform");

  const statusOptions =
    statusField?.options?.choices?.map((c: any) => c?.name).filter(Boolean) || [];

  const ticketPlatformOptions =
    ticketPlatformField?.options?.choices?.map((c: any) => c?.name).filter(Boolean) || [];

  return json(true, { statusOptions, ticketPlatformOptions });
}
