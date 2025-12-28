import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

/* -------------------- helpers -------------------- */

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/* -------------------- DELETE -------------------- */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return unauthorized();

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) return unauthorized();

  const { id } = await req.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing event id" },
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

  const r = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
    }
  );

  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json(
      { ok: false, error: "Airtable delete failed", details: t },
      { status: r.status }
    );
  }

  return NextResponse.json({ ok: true });
}
