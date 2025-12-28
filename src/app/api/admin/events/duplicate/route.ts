import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

/* -------------------- helpers -------------------- */

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/* -------------------- DUPLICATE EVENT -------------------- */

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    const email = (session?.user?.email || "").toLowerCase().trim();
    if (!email) return unauthorized();

    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.includes(email)) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const sourceId = body?.id as string | undefined;

    if (!sourceId) {
      return NextResponse.json(
        { ok: false, error: "Missing source event id" },
        { status: 400 }
      );
    }

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json(
        { ok: false, error: "Missing Airtable env" },
        { status: 500 }
      );
    }

    /* 1) fetch source record */
    const rGet = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE_EVENTS
      )}/${sourceId}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      }
    );

    if (!rGet.ok) {
      const t = await rGet.text();
      return NextResponse.json(
        { ok: false, error: "Failed to load source event", details: t },
        { status: rGet.status }
      );
    }

    const source = await rGet.json();
    const fields = source?.fields || {};

    /* 2) prepare duplicated fields */
    const newFields: Record<string, any> = {
      ...fields,
      "Event Name": `${fields["Event Name"] || "Event"} (copy)`,
    };

    // sicurezza: rimuoviamo campi non duplicabili
    delete newFields["Created"];
    delete newFields["Last Modified"];
    delete newFields["Slug"];

    /* 3) create new record */
    const rCreate = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE_EVENTS
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: newFields }),
      }
    );

    if (!rCreate.ok) {
      const t = await rCreate.text();
      return NextResponse.json(
        { ok: false, error: "Airtable duplicate failed", details: t },
        { status: rCreate.status }
      );
    }

    const created = await rCreate.json();

    return NextResponse.json({
      ok: true,
      id: created?.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
