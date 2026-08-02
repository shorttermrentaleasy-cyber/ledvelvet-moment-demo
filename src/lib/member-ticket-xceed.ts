import "server-only";

import { normalizeMemberBarcode } from "@/lib/member-ticket";
import { normalizeEmail, normalizePhone } from "@/lib/ticket-prescreen";

type XceedOffer = {
  name?: string | null;
};

type XceedTicket = {
  qrCode?: string | null;
  idNumber?: string | number | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean | null;
  offer?: XceedOffer | null;
  pass?: {
    qrCode?: string | null;
    idNumber?: string | number | null;
    email?: string | null;
    phone?: string | null;
    isActive?: boolean | null;
    offer?: XceedOffer | null;
  } | null;
};

type XceedBookingPass = {
  qrCode?: string | null;
  idNumber?: string | number | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean | null;
  offer?: XceedOffer | null;
};

type XceedBooking = {
  buyer?: {
    idNumber?: string | number | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  passes?: XceedBookingPass[] | null;
  offer?: XceedOffer | null;
};

export type MemberTicketCheck = {
  status: "purchased" | "not_purchased" | "unavailable";
  offerName: string | null;
};

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
  matches: (row: T) => string | null | undefined | false
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
    for (const row of rows) {
      const offerName = matches(row);
      if (offerName !== false && offerName !== undefined) {
        return { matched: true, offerName: offerName || null };
      }
    }
    if (rows.length < PAGE_SIZE) return { matched: false, offerName: null };
  }

  throw new Error(`Xceed ${path} pagination exceeded the safety limit`);
}

function sameIdentity(
  candidateEmail: unknown,
  candidatePhone: unknown,
  expectedEmail: string,
  expectedPhone: string
) {
  return Boolean(
    expectedEmail &&
      expectedPhone &&
      normalizeEmail(candidateEmail) === expectedEmail &&
      normalizePhone(candidatePhone) === expectedPhone
  );
}

function ticketMatches(
  ticket: XceedTicket,
  barcode: string,
  email: string,
  phone: string
) {
  const active = ticket.isActive !== false && ticket.pass?.isActive !== false;
  if (!active) return false;

  const pass = ticket.pass;
  const matched =
    sameBarcode(ticket.idNumber ?? pass?.idNumber, barcode) ||
    sameIdentity(ticket.email ?? pass?.email, ticket.phone ?? pass?.phone, email, phone);

  return matched ? ticket.offer?.name || pass?.offer?.name || null : false;
}

function bookingMatches(
  booking: XceedBooking,
  barcode: string,
  email: string,
  phone: string
) {
  const passes = Array.isArray(booking.passes) ? booking.passes : [];

  for (const pass of passes) {
    if (
      pass.isActive !== false &&
      (sameBarcode(pass.idNumber, barcode) ||
        sameIdentity(pass.email, pass.phone, email, phone))
    ) {
      return pass.offer?.name || booking.offer?.name || null;
    }
  }

  const buyerMatches = passes.length === 1 &&
    passes[0]?.isActive !== false &&
    (sameBarcode(booking.buyer?.idNumber, barcode) ||
      sameIdentity(booking.buyer?.email, booking.buyer?.phone, email, phone));

  return buyerMatches ? passes[0]?.offer?.name || booking.offer?.name || null : false;
}

export async function checkMemberTicketOnXceed(params: {
  xceedEventId: string;
  barcode: string;
  email: string;
  phone: string;
}): Promise<MemberTicketCheck> {
  const eventId = params.xceedEventId.trim();
  const barcode = params.barcode.trim();
  const email = normalizeEmail(params.email);
  const phone = normalizePhone(params.phone);
  if (!eventId || !barcode) return { status: "unavailable", offerName: null };

  const [ticketsResult, bookingsResult] = await Promise.allSettled([
    hasMatchAcrossPages<XceedTicket>("tickets", eventId, (ticket) =>
      ticketMatches(ticket, barcode, email, phone)
    ),
    hasMatchAcrossPages<XceedBooking>("bookings", eventId, (booking) =>
      bookingMatches(booking, barcode, email, phone)
    ),
  ]);

  if (ticketsResult.status === "fulfilled" && ticketsResult.value.matched) {
    return {
      status: "purchased",
      offerName: ticketsResult.value.offerName,
    };
  }

  if (bookingsResult.status === "fulfilled" && bookingsResult.value.matched) {
    return {
      status: "purchased",
      offerName: bookingsResult.value.offerName,
    };
  }

  return {
    status:
      ticketsResult.status === "fulfilled" && bookingsResult.status === "fulfilled"
        ? "not_purchased"
        : "unavailable",
    offerName: null,
  };
}
