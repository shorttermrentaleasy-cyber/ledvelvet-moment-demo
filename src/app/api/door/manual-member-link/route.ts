import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env" },
        { status: 500 }
      );
    }

    const body = await req.json();

    const event_id = String(body?.event_id || "").trim();
    const booking_id =
      body?.booking_id === null || body?.booking_id === undefined
        ? null
        : String(body.booking_id).trim() || null;
    const ticket_qr_code = String(body?.ticket_qr_code || "").trim();
    const ticket_full_name =
      body?.ticket_full_name === null || body?.ticket_full_name === undefined
        ? null
        : String(body.ticket_full_name).trim() || null;
    const linked_member_id = String(body?.linked_member_id || "").trim();
    const linked_member_name = String(body?.linked_member_name || "").trim();
    const linked_by = String(body?.linked_by || "").trim();
    const gate_id =
      body?.gate_id === null || body?.gate_id === undefined
        ? null
        : String(body.gate_id).trim() || null;

    if (
      !event_id ||
      !ticket_qr_code ||
      !linked_member_id ||
      !linked_member_name ||
      !linked_by
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: existing, error: existingError } = await supabase
      .from("door_manual_member_links")
      .select("id")
      .eq("event_id", event_id)
      .eq("ticket_qr_code", ticket_qr_code)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { ok: false, error: existingError.message },
        { status: 500 }
      );
    }

    const payload = {
      event_id,
      booking_id,
      ticket_qr_code,
      ticket_full_name,
      linked_member_id,
      linked_member_name,
      linked_by,
      gate_id,
    };

    const { data, error } = await supabase
      .from("door_manual_member_links")
      .upsert(payload, {
        onConflict: "event_id,ticket_qr_code",
      })
      .select(
        "id,event_id,booking_id,ticket_qr_code,ticket_full_name,linked_member_id,linked_member_name,linked_by,gate_id,created_at"
      )
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      created: !existing,
      link: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}