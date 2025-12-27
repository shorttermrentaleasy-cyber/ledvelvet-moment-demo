import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isAdmin(email?: string | null) {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

// test visivo
export async function GET() {
  return json(200, { ok: true, route: "delete" });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const { id } = await req.json();
    if (!id) return json(400, { ok: false, error: "Missing id" });

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } =
      process.env;

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS!
    )}/${id}`;

    const r = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("Airtable delete error:", t);
      return json(500, { ok: false, error: "Airtable delete failed" });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: "Server error" });
  }
}
