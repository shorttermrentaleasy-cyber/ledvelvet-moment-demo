import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  // AUTH
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return unauthorized();

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(session.user.email.toLowerCase())) {
    return unauthorized();
  }

  // ENV
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return NextResponse.json(
      { ok: false, error: "Missing Airtable env vars" },
      { status: 400 }
    );
  }

  // META API: schema tabelle
  const url = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
  });

  const data = await r.json();

  if (!r.ok) {
    console.error("Airtable meta error", data);
    return NextResponse.json({ ok: false, error: "Airtable meta error" }, { status: 500 });
  }

  // trova tabella EVENTS
  const table = (data.tables || []).find((t: any) => t.name === "EVENTS");
  if (!table) {
    return NextResponse.json(
      { ok: false, error: "Table EVENTS not found" },
      { status: 400 }
    );
  }

  const status: { id: string; label: string }[] = [];
  const ticketPlatform: { id: string; label: string }[] = [];

  for (const field of table.fields || []) {
    if (field.name === "Status" && field.options?.choices) {
      for (const c of field.options.choices) {
        status.push({ id: c.id, label: c.name });
      }
    }

    if (field.name === "Ticket Platform" && field.options?.choices) {
      for (const c of field.options.choices) {
        ticketPlatform.push({ id: c.id, label: c.name });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    status,
    ticketPlatform,
  });
}
