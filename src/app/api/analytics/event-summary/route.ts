import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function toCents(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  const cleaned = String(v).replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);

  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n > 1000) return Math.round(n);

  return Math.round(n * 100);
}

function getQrCode(t: any): string | null {
  const raw = t.raw || {};

  return (
    raw?.ticket?.qrCode ||
    raw?.pass?.qrCode ||
    raw?.["QR Code"] ||
    raw?.qrCode ||
    raw?.qr_code ||
    null
  );
}

function getAmountFromQr(qr: string | null): number | null {
  if (!qr) return null;

  const parts = String(qr).split("|");
  if (parts.length < 5) return null;

  const cents = Number(parts[4]);
  if (!Number.isFinite(cents)) return null;
  if (cents <= 0) return null;

  return cents;
}

function normalizeTicketType(t: any): string {
  const raw = t.raw || {};

  const offerType = String(
    raw?.offer?.type ||
      raw?.ticket?.offer?.type ||
      raw?.booking?.offer?.type ||
      raw?.["Booking type"] ||
      ""
  ).toLowerCase();

  const offerName = String(
    raw?.offer?.name ||
      raw?.ticket?.offer?.name ||
      raw?.booking?.offer?.name ||
      raw?.["Offer title"] ||
      ""
  ).toLowerCase();

  const source = String(raw?.source || "").toLowerCase();

  const combined = `${offerType} ${offerName} ${source}`;

  if (
    combined.includes("penale") ||
    combined.includes("penalty") ||
    combined.includes("late") ||
    combined.includes("after") ||
    combined.includes("fee")
  ) {
    return "penalty";
  }

  if (combined.includes("drink")) return "drink";

  if (
    combined.includes("guest") ||
    combined.includes("guest-list") ||
    combined.includes("guest list") ||
    combined.includes("guestlist")
  ) {
    return "guest-list";
  }

  if (
    combined.includes("bottle") ||
    combined.includes("table") ||
    combined.includes("bottle-service") ||
    combined.includes("bottle service")
  ) {
    return "bottle-service";
  }

  if (combined.includes("cancel")) return "cancelled";

  if (
    combined.includes("ticket") ||
    combined.includes("general") ||
    combined.includes("early") ||
    combined.includes("entry") ||
    combined.includes("ingresso") ||
    combined.includes("access") ||
    combined.trim() === ""
  ) {
    return "ticket";
  }

  return "unknown";
}


function getTicketAmountCents(t: any): number | null {
  const raw = t.raw || {};
  const ticket = raw.ticket || {};
  const booking = ticket.booking || raw.booking || {};
  const offer = ticket.offer || raw.offer || {};
  const qr = getQrCode(t);

  const candidates = [
    raw["Price"],
    raw["Online Price"],
    raw["Amount"],
    raw["Total"],
    raw["Paid"],

    ticket?.offer?.price?.amount,
    ticket?.offer?.price?.onlinePrice,
    ticket?.offer?.price?.offlinePrice,

    offer?.price?.amount,
    offer?.price?.onlinePrice,
    offer?.price?.offlinePrice,

    ticket.price,
    ticket.amount,
    ticket.total,
    ticket.paidAmount,
    ticket.amountPaid,

    booking.price,
    booking.amount,
    booking.total,
    booking.totalPaid,
    booking.amountPaid,
    booking.finalPrice,

    offer.price,
    offer.amount,

    getAmountFromQr(qr),

    raw["Offline Price"],
  ];

  for (const c of candidates) {
    const cents = typeof c === "number" ? toCents(c) : toCents(c);
    if (cents !== null) return cents;
  }

  return null;
}

function getDoorQrCode(d: any): string | null {
  return d.qr_code || d.ticket_qr_code || null;
}

function isCheckedInDoor(d: any) {
  const qrCode = getDoorQrCode(d);
  if (!qrCode) return false;

  const payload = d.payload_json || {};

  return (
    d.live_key?.includes("__checked_in") ||
    Boolean(payload.checked_in_by) ||
    Boolean(payload.checked_in_time)
  );
}

function isNewPollingEvent(d: any) {
  const payload = d.payload_json || {};
  return Boolean(payload.checked_in_by) || Boolean(payload.checked_in_time);
}

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "Missing eventId" }, { status: 400 });
    }

    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      assertEnv("SUPABASE_SERVICE_ROLE");

    const supabase = createClient(
      assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
      serviceRole
    );

    let tickets: any[] = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("xceed_tickets")
        .select("status, raw")
        .eq("event_id", eventId)
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      tickets = tickets.concat(data);
      if (data.length < batchSize) break;
      from += batchSize;
    }

    let door: any[] = [];
    let fromDoor = 0;

    while (true) {
      const { data, error } = await supabase
        .from("door_live_events")
        .select(
          "qr_code, ticket_qr_code, gate_id, door_role, live_key, payload_json, created_at"
        )
        .eq("event_id", eventId)
        .range(fromDoor, fromDoor + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      door = door.concat(data);
      if (data.length < batchSize) break;
      fromDoor += batchSize;
    }

    let totalTickets = 0;
    const byType: any = {};
const bottleRevenueKeys = new Set<string>();

    for (const t of tickets) {
      const qr = getQrCode(t);
      if (!qr) continue;

      const type = normalizeTicketType(t);
      const amountCents = getTicketAmountCents(t);
      const status = String(t.status || "").toLowerCase();

      if (status === "cancelled" && type !== "penalty") continue;

      totalTickets++;

      if (!byType[type]) {
        byType[type] = {
          total: 0,
          in: 0,
          out: 0,
          revenue_cents: 0,
          revenue_eur: 0,
          missing_amount: 0,
        };
      }

      byType[type].total++;

if (amountCents !== null) {
  if (type === "bottle-service") {
    const raw = t.raw || {};
    const key =
      raw?.booking?.paymentId ||
      raw?.booking?.id ||
      raw?.ticket?.booking?.paymentId ||
      raw?.ticket?.booking?.bookingUuid ||
      getQrCode(t);

    if (!bottleRevenueKeys.has(key)) {
      bottleRevenueKeys.add(key);
      byType[type].revenue_cents += amountCents;
    }
  } else {
    byType[type].revenue_cents += amountCents;
  }
} else {
  byType[type].missing_amount++;
}

      if (status === "checked_in") {
        byType[type].in++;
      }
    }

    Object.keys(byType).forEach((k) => {
      byType[k].out = byType[k].total - byType[k].in;
      byType[k].revenue_eur = byType[k].revenue_cents / 100;
    });

    let checkedIn = 0;
    let revenueCents = 0;
    let missingAmount = 0;

    Object.values(byType).forEach((t: any) => {
      checkedIn += t.in || 0;
      revenueCents += t.revenue_cents || 0;
      missingAmount += t.missing_amount || 0;
    });

    const doorByQr = new Map<string, any>();

    for (const d of door) {
      if (!isCheckedInDoor(d)) continue;

      const qrCode = getDoorQrCode(d);
      if (!qrCode) continue;

      const current = doorByQr.get(qrCode);

      if (!current || (!isNewPollingEvent(current) && isNewPollingEvent(d))) {
        doorByQr.set(qrCode, d);
      }
    }

    const uniqueDoorEvents = Array.from(doorByQr.values());
    const checkedInDoor = uniqueDoorEvents.length;

    const byGate: any = {};
    const byRole: any = {};

    for (const d of uniqueDoorEvents) {
      const gate = d.gate_id || "unknown";
      const role = d.door_role || "unknown";

      byGate[gate] = (byGate[gate] || 0) + 1;
      byRole[role] = (byRole[role] || 0) + 1;
    }

    const timelineMap: any = {};

    for (const d of uniqueDoorEvents) {
      if (!d.created_at) continue;

      const date = new Date(d.created_at);
      const minutes = Math.floor(date.getMinutes() / 15) * 15;
      date.setMinutes(minutes, 0, 0);

      const key = date.toISOString();
      timelineMap[key] = (timelineMap[key] || 0) + 1;
    }

    const timeline = Object.entries(timelineMap)
      .map(([time, total]) => ({ time, total }))
      .sort((a, b) => a.time.localeCompare(b.time));

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      totals: {
        tickets: totalTickets,
        checked_in_xceed: checkedIn,
        checked_in_door: checkedInDoor,
        gap_door_vs_xceed: checkedIn - checkedInDoor,
        not_arrived: totalTickets - checkedIn,
        conversion_rate: totalTickets > 0 ? checkedIn / totalTickets : 0,
        revenue_cents: revenueCents,
        revenue_eur: revenueCents / 100,
        missing_amount_tickets: missingAmount,
      },
      by_type: byType,
      by_gate: byGate,
      by_role: byRole,
      timeline,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "error" },
      { status: 500 }
    );
  }
}
