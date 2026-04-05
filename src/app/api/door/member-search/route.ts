import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE as string,
  { auth: { persistSession: false } }
);

function esc(value: string) {
  return value.replace(/[%(),]/g, " ").trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQ = String(searchParams.get("q") || "").trim();

    if (!rawQ || rawQ.length < 2) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const q = esc(rawQ);
    const parts = q.split(/\s+/).filter(Boolean);

    let query = supabase
      .from("members")
      .select(
        "id, first_name, last_name, email, phone, membership_group, status, membership_expires_at"
      )
      .limit(12);

    if (parts.length >= 2) {
      const first = esc(parts[0]);
      const last = esc(parts.slice(1).join(" "));

      query = query.or(
        [
          `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`,
          `and(first_name.ilike.%${last}%,last_name.ilike.%${first}%)`,
          `email.ilike.%${q}%`,
          `phone.ilike.%${q}%`,
        ].join(",")
      );
    } else {
      query = query.or(
        [
          `first_name.ilike.%${q}%`,
          `last_name.ilike.%${q}%`,
          `email.ilike.%${q}%`,
          `phone.ilike.%${q}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, items: data || [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}