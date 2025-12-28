import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* -------------------- helpers -------------------- */

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function normalizeList(v: any[]): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x?.name))
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/* -------------------- META EVENTS -------------------- */

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const email = (session?.user?.email || "").toLowerCase().trim();
    if (!email) return unauthorized();

    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.includes(email)) return unauthorized();

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { ok: false, error: "Missing Airtable env" },
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
      tables.find((t) => String(t.name).toLowerCase() === "events") || null;

    if (!table || !Array.isArray(table.fields)) {
      return NextResponse.json(
        { ok: false, error: "EVENTS table not found in Airtable meta" },
        { status: 404 }
      );
    }

    const fieldChoices = (fieldName: string): string[] => {
      const field = table.fields.find((f: any) => f.name === fieldName);
      return normalizeList(field?.options?.choices || []);
    };

    const status = fieldChoices("Status");
    const ticketPlatform = fieldChoices("Ticket Platform");

    return NextResponse.json({
      ok: true,
      status,
      ticketPlatform,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
