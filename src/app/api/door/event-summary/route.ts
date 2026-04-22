import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const dynamic = "force-dynamic";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId")?.trim();

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Missing eventId" },
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

const { count: totalTickets, error: totalError } = await supabase
  .from("xceed_tickets")
  .select("*", { count: "exact", head: true })
  .eq("event_id", eventId)
  .not("qr_code", "is", null);

    if (totalError) {
      return NextResponse.json(
        { ok: false, error: totalError.message || "Errore conteggio totale" },
        { status: 500 }
      );
    }

    const { count: checkedInTickets, error: checkedError } = await supabase
      .from("xceed_tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "checked_in");

    if (checkedError) {
      return NextResponse.json(
        { ok: false, error: checkedError.message || "Errore conteggio entrati" },
        { status: 500 }
      );
    }

    const total = Number(totalTickets || 0);
    const entered = Number(checkedInTickets || 0);
    const missing = Math.max(0, total - entered);

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      total_tickets: total,
      entered_tickets: entered,
      missing_tickets: missing,
    });
  } catch (error: any) {
    console.error("door event-summary route error", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          error?.details ||
          error?.hint ||
          "Unexpected error",
      },
      { status: 500 }
    );
  }
}