import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalize(value: unknown) {
  return String(value || "").trim();
}

function jsonFast(ok: boolean, reason: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok,
      reason,
      ...(extra || {}),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await req.json();

    const eventId = normalize(body.event_id);
    const code = normalize(body.code);

    if (!eventId || !code) {
      return jsonFast(false, "MISSING_INPUT", {
        ms: Date.now() - startedAt,
      });
    }

    const supabase = createClient(
      assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: { persistSession: false },
      }
    );

    const { data: ticket, error } = await supabase
      .from("xceed_tickets")
      .select("id,status,raw,checkin_id")
      .eq("event_id", eventId)
      .eq("qr_code", code)
      .maybeSingle();

    if (error) {
      console.error("FAST_CHECK_ERROR", error);
      return jsonFast(false, "DB_ERROR", {
        ms: Date.now() - startedAt,
      });
    }

    if (!ticket) {
      return jsonFast(false, "NOT_FOUND", {
        ms: Date.now() - startedAt,
      });
    }

    const raw: any = ticket.raw || {};
    const status = String(ticket.status || "").toLowerCase();

    const offerType = String(
      raw?.offer?.type ||
        raw?.ticket?.offer?.type ||
        raw?.booking?.offer?.type ||
        ""
    ).toLowerCase();

    const isActive =
      raw?.pass?.isActive ??
      raw?.ticket?.isActive ??
      raw?.booking?.passes?.[0]?.isActive ??
      null;

    const hasCheckedIn =
      raw?.pass?.hasCheckedIn ??
      raw?.ticket?.hasCheckedIn ??
      raw?.booking?.passes?.[0]?.hasCheckedIn ??
      false;

    const cancelled =
      status.includes("cancel") ||
      status.includes("refund") ||
      offerType === "cancelled" ||
      isActive === false;

    if (cancelled) {
      return jsonFast(false, "CANCELLED_OR_INACTIVE", {
        ms: Date.now() - startedAt,
        status,
        offer_type: offerType || null,
      });
    }

    const isCheckedIn =
      status === "checked_in" || !!ticket.checkin_id || hasCheckedIn === true;

    return jsonFast(true, "VALID_TICKET", {
      ms: Date.now() - startedAt,
      checked_in: isCheckedIn,
      status,
      offer_type: offerType || null,
    });
  } catch (err) {
    console.error("FAST_CHECK_FATAL", err);
    return jsonFast(false, "FATAL_ERROR", {
      ms: Date.now() - startedAt,
    });
  }
}