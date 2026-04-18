import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const event_id = String(body.event_id || "").trim();
    const ticket_qr_code = String(body.ticket_qr_code || "").trim();

    if (!event_id || !ticket_qr_code) {
      return NextResponse.json(
        { ok: false, error: "Missing event_id or ticket_qr_code" },
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const now = new Date().toISOString();

    const { data: existing, error: findError } = await supabase
      .from("door_non_member_attempts")
      .select("id")
      .eq("event_id", event_id)
      .eq("ticket_qr_code", ticket_qr_code)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { ok: false, error: findError.message },
        { status: 500 }
      );
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("door_non_member_attempts")
        .update({
          last_seen_at: now,
          booking_id: body.booking_id ?? null,
          transaction_id: body.transaction_id ?? null,
          full_name: body.full_name ?? null,
          email: body.email ?? null,
          phone: body.phone ?? null,
        })
        .eq("id", existing.id);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, created: false });
    }

    const { error: insertError } = await supabase
      .from("door_non_member_attempts")
      .insert({
        event_id,
        ticket_qr_code,
        booking_id: body.booking_id ?? null,
        transaction_id: body.transaction_id ?? null,
        full_name: body.full_name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        first_seen_at: now,
        last_seen_at: now,
        status: "pending_wally",
      });

    if (insertError) {
      const msg = String(insertError.message || "").toLowerCase();
      const isUnique =
        msg.includes("duplicate") ||
        msg.includes("unique") ||
        msg.includes("door_non_member_attempts_event_qr_uidx");

      if (isUnique) {
        const { error: retryUpdateError } = await supabase
          .from("door_non_member_attempts")
          .update({ last_seen_at: now })
          .eq("event_id", event_id)
          .eq("ticket_qr_code", ticket_qr_code);

        if (retryUpdateError) {
          return NextResponse.json(
            { ok: false, error: retryUpdateError.message },
            { status: 500 }
          );
        }

        return NextResponse.json({ ok: true, created: false });
      }

      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, created: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}