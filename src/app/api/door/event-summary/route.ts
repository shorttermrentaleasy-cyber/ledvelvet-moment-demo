import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

async function countAllRows(
  supabase: any,
  eventId: string,
  status?: "active" | "checked_in" | "cancelled"
) {
  const pageSize = 1000;
  let from = 0;
  let total = 0;

  while (true) {
    let query = supabase
      .from("xceed_tickets")
      .select("id", { head: false })
      .eq("event_id", eventId)
      .range(from, from + pageSize - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    const batch = data || [];
    total += batch.length;

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return total;
}

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

    const total = await countAllRows(supabase, eventId);
    const entered = await countAllRows(supabase, eventId, "checked_in");
    const missing = Math.max(0, total - entered);

    console.log("EVENT SUMMARY COUNTS", {
      eventId,
      total,
      entered,
      missing,
      supabaseUrl: SUPABASE_URL,
      debug,
    });

    if (!debug) {
      return NextResponse.json({
        ok: true,
        event_id: eventId,
        total_tickets: total,
        entered_tickets: entered,
        missing_tickets: missing,
      });
    }

    const { data: sampleRows, error: sampleError } = await supabase
      .from("xceed_tickets")
      .select("id, qr_code, status, imported_at")
      .eq("event_id", eventId)
      .order("imported_at", { ascending: false })
      .limit(50);

    if (sampleError) {
      return NextResponse.json(
        { ok: false, error: sampleError.message || "Errore debug rows" },
        { status: 500 }
      );
    }

    const allRows = sampleRows || [];
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
        sample_size: allRows.length,
        sample_active: activeRows.length,
        sample_checked_in: checkedRows.length,
        sample_null_qr: nullQrRows.length,
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