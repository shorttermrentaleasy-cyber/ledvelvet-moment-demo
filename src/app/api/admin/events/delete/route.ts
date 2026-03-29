import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
    const id = body?.id as string | undefined;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return NextResponse.json({ ok: false, error: "Missing Airtable env" }, { status: 500 });
    }

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      }
    );

    if (!airtableRes.ok) {
      const t = await airtableRes.text();
      return NextResponse.json(
        { ok: false, error: "Airtable delete failed", details: t },
        { status: airtableRes.status }
      );
    }

    // Sync minima verso Supabase: delete per airtable_record_id
    const supabase = supabaseAdmin();

    const { error: supabaseError } = await supabase
      .from("events")
      .delete()
      .eq("airtable_record_id", id);

    if (supabaseError) {
      console.error("Supabase events delete failed:", {
        message: supabaseError.message,
        details: (supabaseError as any).details,
        hint: (supabaseError as any).hint,
        code: (supabaseError as any).code,
        airtableRecordId: id,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Supabase events delete failed",
          airtableId: id,
          details: supabaseError.message,
          pg_details: (supabaseError as any).details || null,
          pg_hint: (supabaseError as any).hint || null,
          pg_code: (supabaseError as any).code || null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}