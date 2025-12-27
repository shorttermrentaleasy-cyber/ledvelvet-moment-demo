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

// ✅ TEST: se questa non risponde, il path è sbagliato
export async function GET() {
  return json(200, { ok: true, route: "/api/admin/events/delete" });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const recordId = (body?.id || "").toString().trim();
    if (!recordId) return json(400, { ok: false, error: "Missing id" });

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return json(500, { ok: false, error: "Missing Airtable env" });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}/${recordId}`;

    const r = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("Airtable delete error:", r.status, text);
      return json(500, { ok: false, error: `Airtable delete failed (${r.status})` });
    }

    return json(200, { ok: true });
  } catch (e: any) {
    console.error("Delete route error:", e);
    return json(500, { ok: false, error: "Server error" });
  }
}
