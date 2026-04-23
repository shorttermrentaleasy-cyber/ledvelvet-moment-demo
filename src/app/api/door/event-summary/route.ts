import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId")?.trim();
    const debug = req.nextUrl.searchParams.get("debug") === "1";

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
      .eq("event_id", eventId);

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

    if (!debug) {
      return NextResponse.json({
        ok: true,
        event_id: eventId,
        total_tickets: total,
        entered_tickets: entered,
        missing_tickets: missing,
      });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("xceed_tickets")
      .select("id, qr_code, status, imported_at")
      .eq("event_id", eventId)
      .order("imported_at", { ascending: false })
      .limit(200);

    if (rowsError) {
      return NextResponse.json(
        { ok: false, error: rowsError.message || "Errore debug rows" },
        { status: 500 }
      );
    }

    const allRows = rows || [];
    const activeRows = allRows.filter((r) => r.status === "active");
    const checkedRows = allRows.filter((r) => r.status === "checked_in");
    const nullQrRows = allRows.filter((r) => !r.qr_code);

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      supabase_url: SUPABASE_URL,
      total_tickets: total,
      entered_tickets: entered,
      missing_tickets: missing,
      debug: {
        sampled_rows: allRows.length,
        sampled_active: activeRows.length,
        sampled_checked_in: checkedRows.length,
        sampled_null_qr: nullQrRows.length,
        checked_in_qr_sample: checkedRows.slice(0, 10).map((r) => r.qr_code),
        active_qr_sample: activeRows.slice(0, 10).map((r) => r.qr_code),
      },
    });
  } catch (error: any) {
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