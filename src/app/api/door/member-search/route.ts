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

type MemberRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  membership_group: string | null;
  status: string | null;
  membership_expires_at: string | null;
};

type CheckinRow = {
  member_id: string | null;
  created_at: string | null;
  gate_id?: string | null;
  checked_by?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQ = String(searchParams.get("q") || "").trim();
    const eventId = String(searchParams.get("eventId") || "").trim();

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

    const items: MemberRow[] = data || [];

    if (!eventId || items.length === 0) {
      return NextResponse.json({
        ok: true,
        items: items.map((item) => ({
          ...item,
          already_entered: false,
          entered_at: null,
          entered_gate: null,
          entered_by: null,
        })),
      });
    }

    const memberIds = items.map((x) => x.id).filter(Boolean);

    if (memberIds.length === 0) {
      return NextResponse.json({
        ok: true,
        items: items.map((item) => ({
          ...item,
          already_entered: false,
          entered_at: null,
          entered_gate: null,
          entered_by: null,
        })),
      });
    }

    const { data: checkins, error: checkinsError } = await supabase
      .from("checkins")
      .select("member_id, created_at, gate_id, checked_by")
      .eq("event_id", eventId)
      .in("member_id", memberIds)
      .order("created_at", { ascending: false });

    if (checkinsError) {
      return NextResponse.json(
        { ok: false, error: checkinsError.message },
        { status: 500 }
      );
    }

    const latestByMember = new Map<
      string,
      { entered_at: string | null; entered_gate: string | null; entered_by: string | null }
    >();

    for (const row of (checkins || []) as CheckinRow[]) {
      if (!row?.member_id) continue;
      if (!latestByMember.has(row.member_id)) {
        latestByMember.set(row.member_id, {
          entered_at: row.created_at || null,
          entered_gate: row.gate_id || null,
          entered_by: row.checked_by || null,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      items: items.map((item) => {
        const hit = latestByMember.get(item.id);
        return {
          ...item,
          already_entered: !!hit?.entered_at,
          entered_at: hit?.entered_at || null,
          entered_gate: hit?.entered_gate || null,
          entered_by: hit?.entered_by || null,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}