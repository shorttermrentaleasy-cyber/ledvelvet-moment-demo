import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

async function fetchAllTickets(supabase: any, eventId: string) {
  const pageSize = 1000;
  let from = 0;
  const allRows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("xceed_tickets")
      .select("id, qr_code, status, raw, imported_at")
      .eq("event_id", eventId)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data || [];
    allRows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

async function countEnteredFromLiveEvents(supabase: any, eventId: string) {
  const { data, error } = await supabase
    .from("door_live_events")
    .select("ticket_qr_code, payload_json")
    .eq("event_id", eventId);

  if (error) throw error;

  const enteredQr = new Set<string>();

  for (const row of data || []) {
    const payload = row?.payload_json || {};
    const qr = row?.ticket_qr_code || payload?.ticket?.qr_code || null;
    if (!qr) continue;

    const result = payload?.result;
    const checkedIn = payload?.ticket?.checked_in === true;
    const checkedBy = payload?.debug?.checkedInBy;

    if (
      checkedIn ||
      checkedBy ||
      result === "ALREADY_CHECKED_IN" ||
      result === "OK_MEMBER" ||
      result === "OK_PRIORITY" ||
      result === "OK_PRIVILEGED"
    ) {
      enteredQr.add(String(qr));
    }
  }

  return enteredQr.size;
}

function classifyTicket(row: any) {
  const status = String(row?.status || "").toLowerCase();

  const offerType = String(
    row?.raw?.offer?.type ||
      row?.raw?.ticket?.offer?.type ||
      ""
  ).toLowerCase();

  if (status === "cancelled") return "cancelled";
  if (offerType === "guest-list") return "guest";
  if (offerType === "bottle-service") return "table";

  return "ticket";
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

    const allRows = await fetchAllTickets(supabase, eventId);

    const totalTickets = allRows.length;
    const enteredTickets = await countEnteredFromLiveEvents(supabase, eventId);
    const cancelledCount = allRows.filter(
      (r) => String(r.status || "").toLowerCase() === "cancelled"
    ).length;

    let ticketCount = 0;
    let drinkCount = 0;
    let guestCount = 0;
    let tableCount = 0;

    for (const row of allRows) {
      const kind = classifyTicket(row);

      if (kind === "cancelled") continue;
      if (kind === "guest") guestCount++;
      else if (kind === "table") tableCount++;
      else ticketCount++;
    }

    const missingTickets = Math.max(0, totalTickets - enteredTickets);

    if (!debug) {
      return NextResponse.json({
        ok: true,
        event_id: eventId,
        total_tickets: totalTickets,
        entered_tickets: enteredTickets,
        missing_tickets: missingTickets,
        ticket_count: ticketCount,
        drink_count: drinkCount,
        guest_count: guestCount,
        table_count: tableCount,
        cancelled_count: cancelledCount,
      });
    }

    const sampleRows = allRows
      .slice()
      .sort((a, b) => {
        const da = new Date(a.imported_at || 0).getTime();
        const db = new Date(b.imported_at || 0).getTime();
        return db - da;
      })
      .slice(0, 50);

    const activeRows = sampleRows.filter(
      (r) => String(r.status || "").toLowerCase() === "active"
    );
    const nullQrRows = sampleRows.filter((r) => !r.qr_code);

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      supabase_url: SUPABASE_URL,
      total_tickets: totalTickets,
      entered_tickets: enteredTickets,
      missing_tickets: missingTickets,
      ticket_count: ticketCount,
      drink_count: drinkCount,
      guest_count: guestCount,
      table_count: tableCount,
      cancelled_count: cancelledCount,
      debug: {
        sample_size: sampleRows.length,
        sample_active: activeRows.length,
        sample_null_qr: nullQrRows.length,
        entered_source: "door_live_events",
        classified_sample: sampleRows.slice(0, 20).map((r) => ({
          qr_code: r.qr_code,
          status: r.status,
          kind: classifyTicket(r),
          offer_type:
            r?.raw?.offer?.type || r?.raw?.ticket?.offer?.type || null,
          offer_name:
            r?.raw?.offer?.name || r?.raw?.ticket?.offer?.name || null,
        })),
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