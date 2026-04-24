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

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
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

async function findLatestLiveEntry(eventId: string, member: MemberRow) {
  const email = normalize(member.email);
  const phone = normalize(member.phone);
  const canMatchLive = Boolean(email || phone);

  if (canMatchLive) {
    const { data, error } = await supabase
      .from("door_live_events")
      .select("created_at, gate_id, payload_json, ticket_qr_code")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    for (const row of data || []) {
      const payload = row?.payload_json || {};
      const person = payload?.person || {};
      const ticket = payload?.ticket || {};

      const liveEmail = normalize(
        person.email || ticket.email || ticket.buyer_email
      );
      const livePhone = normalize(person.phone || ticket.phone);

      const phoneMatch = phone && livePhone && phone === livePhone;
      const emailMatch = email && liveEmail && email === liveEmail;

      if (!phoneMatch && !emailMatch) continue;

      return {
        already_entered: true,
        entered_at: row.created_at || null,
        entered_gate: row.gate_id || payload?.gate_id || null,
        entered_by: payload?.debug?.checkedInBy || null,
        entered_match: phoneMatch ? "phone" : "email",
        entered_qr: row.ticket_qr_code || ticket.qr_code || null,
        entered_result: payload?.result || null,
        entered_ticket_name: ticket.full_name || person.full_name || null,
        entered_offer_name: ticket.offer_name || null,
        entered_offer_type: ticket.offer_type || null,
      };
    }
  }

  const { data: manualLink, error: manualError } = await supabase
    .from("door_manual_member_links")
    .select(
      "created_at, gate_id, ticket_qr_code, ticket_full_name, linked_by, booking_id"
    )
    .eq("event_id", eventId)
    .eq("linked_member_id", member.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (manualError) throw manualError;

  if (manualLink) {
    return {
      already_entered: true,
      entered_at: manualLink.created_at || null,
      entered_gate: manualLink.gate_id || null,
      entered_by: manualLink.linked_by || null,
      entered_match: "manual_link",
      entered_qr: manualLink.ticket_qr_code || null,
      entered_result: "MANUAL_MEMBER_LINK",
      entered_ticket_name: manualLink.ticket_full_name || null,
      entered_offer_name: null,
      entered_offer_type: null,
    };
  }

  return null;
}

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
          entered_match: null,
          entered_qr: null,
          entered_result: null,
          entered_ticket_name: null,
          entered_offer_name: null,
          entered_offer_type: null,
        })),
      });
    }

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const live = await findLatestLiveEntry(eventId, item);

        return {
          ...item,
          already_entered: !!live,
          entered_at: live?.entered_at || null,
          entered_gate: live?.entered_gate || null,
          entered_by: live?.entered_by || null,
          entered_match: live?.entered_match || null,
          entered_qr: live?.entered_qr || null,
          entered_result: live?.entered_result || null,
          entered_ticket_name: live?.entered_ticket_name || null,
          entered_offer_name: live?.entered_offer_name || null,
          entered_offer_type: live?.entered_offer_type || null,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      items: enrichedItems,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}