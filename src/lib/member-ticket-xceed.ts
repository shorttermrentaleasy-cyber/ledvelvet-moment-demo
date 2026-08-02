import "server-only";

import { normalizeMemberBarcode } from "@/lib/member-ticket";

type XceedTicket = {
  idNumber?: string | number | null;
  isActive?: boolean | null;
  pass?: {
    idNumber?: string | number | null;
    isActive?: boolean | null;
  } | null;
};

type XceedBookingPass = {
  idNumber?: string | number | null;
  isActive?: boolean | null;
};

type XceedBooking = {
  buyer?: { idNumber?: string | number | null } | null;
  passes?: XceedBookingPass[] | null;
};

export type MemberTicketCheck = "purchased" | "not_purchased" | "unavailable";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function sameBarcode(value: unknown, expected: string) {
  return normalizeMemberBarcode(value) === expected;
}

async function hasMatchAcrossPages<T>(
  path: "tickets" | "bookings",
  eventId: string,
  matches: (row: T) => boolean
) {
  const baseUrl = requiredEnv("XCEED_BASE_URL");
  const apiKey = requiredEnv("XCEED_API_KEY");

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`/v1/${path}`, baseUrl);
    url.searchParams.set("offset", String(page * PAGE_SIZE));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("events", eventId);
    url.searchParams.set("includeCancelledTickets", "true");

    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(`Xceed ${path} request failed (${response.status})`);
    }

    const rows = payload.data as T[];
    if (rows.some(matches)) return true;
    if (rows.length < PAGE_SIZE) return false;
  }

  throw new Error(`Xceed ${path} pagination exceeded the safety limit`);
}

function ticketMatches(ticket: XceedTicket, barcode: string) {
  const active = ticket.isActive !== false && ticket.pass?.isActive !== false;
  return active && sameBarcode(ticket.idNumber ?? ticket.pass?.idNumber, barcode);
}

function bookingMatches(booking: XceedBooking, barcode: string) {
  const passes = Array.isArray(booking.passes) ? booking.passes : [];

  if (passes.some((pass) => pass.isActive !== false && sameBarcode(pass.idNumber, barcode))) {
    return true;
  }

  return passes.length === 1 &&
    passes[0]?.isActive !== false &&
    sameBarcode(booking.buyer?.idNumber, barcode);
}

export async function checkMemberTicketOnXceed(params: {
  xceedEventId: string;
  barcode: string;
}): Promise<MemberTicketCheck> {
  const eventId = params.xceedEventId.trim();
  const barcode = params.barcode.trim();
  if (!eventId || !barcode) return "unavailable";

  const [ticketsResult, bookingsResult] = await Promise.allSettled([
    hasMatchAcrossPages<XceedTicket>("tickets", eventId, (ticket) =>
      ticketMatches(ticket, barcode)
    ),
    hasMatchAcrossPages<XceedBooking>("bookings", eventId, (booking) =>
      bookingMatches(booking, barcode)
    ),
  ]);

  if (ticketsResult.status === "fulfilled" && ticketsResult.value) {
    return "purchased";
  }

  if (bookingsResult.status === "fulfilled" && bookingsResult.value) {
    return "purchased";
  }

  return ticketsResult.status === "fulfilled" && bookingsResult.status === "fulfilled"
    ? "not_purchased"
    : "unavailable";
}
