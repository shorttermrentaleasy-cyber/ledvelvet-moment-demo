import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WALLY_URL =
  process.env.NEXT_PUBLIC_WALLY_MEMBERSHIP_URL || "/wally";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

export type MemberRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  membership_group: string | null;
  membership_expires_at: string | null;
};

export type EventPolicy = {
  id: string;
  xceed_event_uuid: string | null;
  xceed_event_ref: string | null;
  require_ticket: boolean | null;
  require_membership: boolean | null;
  require_active_membership: boolean | null;
};

export type DoorRole = "ordinary" | "loyalty" | "privileged";

export type DoorResult =
  | "ERROR"
  | "DENY_WALLY"
  | "DENY_RENEWAL"
  | "ALREADY_CHECKED_IN"
  | "OK_MEMBER"
  | "OK_PRIORITY"
  | "OK_PRIVILEGED";

export type LocalXceedTicket = {
  id: string;
  event_id: string | null;
  qr_code: string | null;
  status: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_email: string | null;
  transaction_id: string | null;
  raw: any;
};

export type BookingStats = {
  booking_id: string | null;
  ticket_count: number;
  checked_in_count: number;
  progress_label: string;
};

export type DoorApiResponse = {
  ok: boolean;
  result: DoorResult;
  booking?: BookingStats | null;
  title: string;
  message: string;
  badge?: string;
  action?: "OPEN_WALLY";
  action_url?: string;
  person?: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  member?: {
    id: string;
    membership_group: string | null;
    status: string | null;
    membership_expires_at: string | null;
    door_role: DoorRole;
  } | null;
  ticket?: {
    id?: string | null;
    qr_code?: string | null;
    event_id?: string | null;
    status?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    buyer_email?: string | null;
    checked_in?: boolean;
    booking_id?: string | null;
    transaction_id?: string | null;
    offer_name?: string | null;
    offer_type?: string | null;
    source?: "xceed_tickets";
  } | null;
  event?: {
    id: string;
    xceed_event_uuid: string | null;
    xceed_event_ref: string | null;
    require_ticket: boolean;
    require_membership: boolean;
    require_active_membership: boolean;
  } | null;
  debug?: {
    matched_by?: "email" | "phone" | "name" | null;
    source?: "xceed_tickets" | "xceed_raw";
  };
  error?: string;
  live_key?: string | null;
};

export type EvaluateDoorXceedLiveInput = {
  qrCode?: string;
  xceedRaw?: any;
  latestCheckedIn?: boolean;
  eventId?: string;
};

function normalizeText(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeEmail(value?: string | null) {
  return normalizeText(value);
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/[^\d+]/g, "").trim();
}

function fullName(first?: string | null, last?: string | null) {
  return [first || "", last || ""].join(" ").trim();
}

function splitFullName(value?: string | null) {
  const clean = (value || "").trim();
  if (!clean) {
    return { firstName: null, lastName: null };
  }

  const parts = clean.split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }

  const half = Math.floor(parts.length / 2);

  return {
    firstName: parts.slice(0, half).join(" "),
    lastName: parts.slice(half).join(" "),
  };
}

function getDoorRole(member: MemberRow): DoorRole {
  const group = normalizeText(member.membership_group);

  if (group.includes("loyalty")) return "loyalty";
  if (group.includes("staff")) return "privileged";
  if (group.includes("ordinari")) return "ordinary";

  return "ordinary";
}

function isMembershipActive(member: MemberRow): boolean {
  if (!member.membership_expires_at) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(member.membership_expires_at);
  exp.setHours(0, 0, 0, 0);

  return exp >= today;
}

function isAlreadyCheckedInFromRaw(raw: any): boolean {
  return Boolean(
    raw?.pass?.hasCheckedIn ||
      raw?.ticket?.hasCheckedIn ||
      raw?.hasCheckedIn
  );
}

function getOfferNameFromRaw(raw: any): string | null {
  return (
    raw?.offer?.name ??
    raw?.ticket?.offer?.name ??
    raw?.booking?.offer?.name ??
    null
  );
}

function getOfferTypeFromRaw(raw: any): string | null {
  return (
    raw?.offer?.type ??
    raw?.ticket?.offer?.type ??
    raw?.booking?.offer?.type ??
    null
  );
}

function getBookingIdFromRaw(raw: any): string | null {
  const value =
    raw?.ticket?.booking?.bookingUuid ??
    raw?.booking?.id ??
    raw?.booking?.bookingUuid ??
    null;

  return value ? String(value) : null;
}

function isAlreadyCheckedInFromLocalTicket(ticket: LocalXceedTicket): boolean {
  if ((ticket.status || "").toLowerCase() === "checked_in") return true;
  return isAlreadyCheckedInFromRaw(ticket.raw);
}

async function fetchLocalXceedTicketByQr(
  qrCode: string
): Promise<LocalXceedTicket | null> {
  const { data, error } = await supabase
    .from("xceed_tickets")
    .select(
      "id, event_id, qr_code, status, full_name, email, phone, buyer_email, transaction_id, raw"
    )
    .eq("qr_code", qrCode)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchLatestCheckedInTicketByEventId(
  eventId: string
): Promise<LocalXceedTicket | null> {
  const { data, error } = await supabase
    .from("xceed_tickets")
    .select(
      "id, event_id, qr_code, status, full_name, email, phone, buyer_email, transaction_id, raw"
    )
    .eq("event_id", eventId)
    .eq("status", "checked_in")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function buildLocalTicketFromRaw(raw: any): Promise<LocalXceedTicket | null> {
  if (!raw || typeof raw !== "object") return null;

  const qrCode =
    raw?.pass?.qrCode ??
    raw?.ticket?.qrCode ??
    raw?.qrCode ??
    raw?.qr_code ??
    null;

  const eventUuid =
    raw?.booking?.event?.id ??
    raw?.xceed_event_uuid ??
    raw?.eventId ??
    raw?.event_id ??
    null;

  if (!qrCode) return null;

  const bookingBuyerFirst =
    raw?.booking?.buyer?.firstName ??
    raw?.ticket?.firstName ??
    raw?.pass?.firstName ??
    null;

  const bookingBuyerLast =
    raw?.booking?.buyer?.lastName ??
    raw?.ticket?.lastName ??
    raw?.pass?.lastName ??
    null;

  return {
    id: "xceed-raw",
    event_id: null,
    qr_code: qrCode,
    status: isAlreadyCheckedInFromRaw(raw) ? "checked_in" : "active",
    full_name: fullName(bookingBuyerFirst, bookingBuyerLast) || null,
    email:
      raw?.pass?.email ??
      raw?.ticket?.email ??
      raw?.booking?.buyer?.email ??
      null,
    phone:
      raw?.pass?.phone ??
      raw?.ticket?.phone ??
      raw?.booking?.buyer?.phone ??
      null,
    buyer_email: raw?.booking?.buyer?.email ?? null,
    transaction_id:
      raw?.booking?.legacyId?.toString?.() ??
      raw?.ticket?.booking?.bookingId?.toString?.() ??
      raw?.booking?.id?.toString?.() ??
      null,
    raw: {
      ...raw,
      xceed_event_uuid: eventUuid,
    },
  };
}

async function fetchEventPolicyByLocalEventId(
  eventId?: string | null
): Promise<EventPolicy | null> {
  if (!eventId) return null;

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, xceed_event_uuid, xceed_event_ref, require_ticket, require_membership, require_active_membership"
    )
    .eq("id", eventId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchEventPolicyByXceedEventId(
  xceedEventId?: string | null
): Promise<EventPolicy | null> {
  if (!xceedEventId) return null;

  const byUuid = await supabase
    .from("events")
    .select(
      "id, xceed_event_uuid, xceed_event_ref, require_ticket, require_membership, require_active_membership"
    )
    .eq("xceed_event_uuid", xceedEventId)
    .limit(1)
    .maybeSingle();

  if (byUuid.error) throw byUuid.error;
  if (byUuid.data) return byUuid.data;

  const byRef = await supabase
    .from("events")
    .select(
      "id, xceed_event_uuid, xceed_event_ref, require_ticket, require_membership, require_active_membership"
    )
    .eq("xceed_event_ref", xceedEventId)
    .limit(1)
    .maybeSingle();

  if (byRef.error) throw byRef.error;
  return byRef.data || null;
}

const MEMBER_SELECT =
  "id, first_name, last_name, email, phone, status, membership_group, membership_expires_at";

async function findMemberByEmail(email?: string | null): Promise<MemberRow | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_SELECT)
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findMemberByPhone(phone?: string | null): Promise<MemberRow | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_SELECT)
    .limit(200);

  if (error) throw error;

  return data?.find((row) => normalizePhone(row.phone) === normalized) || null;
}

async function findMemberByName(
  firstName?: string | null,
  lastName?: string | null
): Promise<MemberRow | null> {
  const first = normalizeText(firstName);
  const last = normalizeText(lastName);

  if (!first || !last) return null;

  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_SELECT)
    .ilike("first_name", firstName || "")
    .ilike("last_name", lastName || "")
    .limit(10);

  if (error) throw error;

  return (
    data?.find(
      (row) =>
        normalizeText(row.first_name) === first &&
        normalizeText(row.last_name) === last
    ) || null
  );
}

async function getBookingStats(ticket: LocalXceedTicket): Promise<BookingStats | null> {
  const bookingId = getBookingIdFromRaw(ticket.raw);
  const transactionId = ticket.transaction_id ? String(ticket.transaction_id) : null;
  const eventId = ticket.event_id ? String(ticket.event_id) : null;

  if (!bookingId && !transactionId) return null;
  if (!eventId) return null;

  const { data, error } = await supabase
    .from("xceed_tickets")
    .select("status, raw, transaction_id, event_id")
    .eq("event_id", eventId)
    .limit(500);

  if (error) throw error;

  const rows = (data || []).filter((row: any) => {
    const rowBookingId =
      row?.raw?.ticket?.booking?.bookingUuid ??
      row?.raw?.booking?.id ??
      row?.raw?.booking?.bookingUuid ??
      null;

    const rowTransactionId =
      row?.transaction_id != null ? String(row.transaction_id) : null;

    if (bookingId && rowBookingId && String(rowBookingId) === String(bookingId)) {
      return true;
    }

    if (transactionId && rowTransactionId && rowTransactionId === transactionId) {
      return true;
    }

    return false;
  });

  const ticketCount = rows.length;

  const checkedInCount = rows.filter((row: any) => {
    const status = String(row?.status || "").toLowerCase();
    if (status === "checked_in") return true;

    return Boolean(
      row?.raw?.pass?.hasCheckedIn ||
      row?.raw?.ticket?.hasCheckedIn ||
      row?.raw?.hasCheckedIn
    );
  }).length;

  return {
    booking_id: bookingId || transactionId || null,
    ticket_count: ticketCount,
    checked_in_count: checkedInCount,
    progress_label: `${checkedInCount} / ${ticketCount}`,
  };
}

async function matchMemberFromLocalTicket(ticket: LocalXceedTicket): Promise<{
  member: MemberRow | null;
  matchedBy: "email" | "phone" | "name" | null;
}> {
  const byEmail = await findMemberByEmail(ticket.email);
  if (byEmail) return { member: byEmail, matchedBy: "email" };

  const byPhone = await findMemberByPhone(ticket.phone);
  if (byPhone) return { member: byPhone, matchedBy: "phone" };

  const split = splitFullName(ticket.full_name);
  const byName = await findMemberByName(split.firstName, split.lastName);
  if (byName) return { member: byName, matchedBy: "name" };

  return { member: null, matchedBy: null };
}

function mapEventForResponse(event: EventPolicy | null) {
  if (!event) return null;

  return {
    id: event.id,
    xceed_event_uuid: event.xceed_event_uuid,
    xceed_event_ref: event.xceed_event_ref,
    require_ticket: Boolean(event.require_ticket),
    require_membership: Boolean(event.require_membership),
    require_active_membership: Boolean(event.require_active_membership),
  };
}

function mapMemberForResponse(member: MemberRow | null) {
  if (!member) return null;

  return {
    id: member.id,
    membership_group: member.membership_group,
    status: member.status,
    membership_expires_at: member.membership_expires_at,
    door_role: getDoorRole(member),
  };
}

function mapTicketForResponse(ticket: LocalXceedTicket) {
  return {
    id: ticket.id,
    qr_code: ticket.qr_code,
    event_id: ticket.event_id,
    status: ticket.status,
    full_name: ticket.full_name,
    email: ticket.email,
    phone: ticket.phone,
    buyer_email: ticket.buyer_email,
    checked_in: isAlreadyCheckedInFromLocalTicket(ticket),
    booking_id: getBookingIdFromRaw(ticket.raw),
    transaction_id: ticket.transaction_id,
    offer_name: getOfferNameFromRaw(ticket.raw),
    offer_type: getOfferTypeFromRaw(ticket.raw),
    source: "xceed_tickets" as const,
  };
}

function attachBooking(
  payload: DoorApiResponse,
  booking: BookingStats | null
): DoorApiResponse {
  return {
    ...payload,
    booking,
  };
}

function buildErrorResponse(
  message: string,
  error?: string,
  event?: EventPolicy | null
): DoorApiResponse {
  return {
    ok: false,
    result: "ERROR",
    title: "ERRORE",
    message,
    error,
    member: null,
    ticket: null,
    event: mapEventForResponse(event || null),
    live_key: null,
    booking: null,
  };
}

function buildDenyWallyResponse(
  ticket: LocalXceedTicket,
  event: EventPolicy | null,
  matchedBy: "email" | "phone" | "name" | null,
  source: "xceed_tickets" | "xceed_raw"
): DoorApiResponse {
  const split = splitFullName(ticket.full_name);

  return {
    ok: true,
    result: "DENY_WALLY",
    title: "NON SOCIO",
    message: "Deve fare tessera",
    badge: "Wally",
    action: "OPEN_WALLY",
    action_url: WALLY_URL,
    person: {
      first_name: split.firstName,
      last_name: split.lastName,
      full_name: ticket.full_name,
      email: ticket.email,
      phone: ticket.phone,
    },
    member: null,
    ticket: mapTicketForResponse(ticket),
    event: mapEventForResponse(event),
    debug: {
      matched_by: matchedBy,
      source,
    },
    live_key: ticket.id || ticket.transaction_id || ticket.qr_code || null,
    booking: null,
  };
}

function buildDenyRenewalResponse(
  member: MemberRow,
  ticket: LocalXceedTicket,
  event: EventPolicy | null,
  matchedBy: "email" | "phone" | "name" | null,
  source: "xceed_tickets" | "xceed_raw"
): DoorApiResponse {
  return {
    ok: true,
    result: "DENY_RENEWAL",
    title: "TESSERA NON ATTIVA",
    message: "Deve rinnovare la tessera",
    badge: "Rinnovo",
    action: "OPEN_WALLY",
    action_url: WALLY_URL,
    person: {
      first_name: member.first_name,
      last_name: member.last_name,
      full_name: fullName(member.first_name, member.last_name),
      email: member.email,
      phone: member.phone,
    },
    member: mapMemberForResponse(member),
    ticket: mapTicketForResponse(ticket),
    event: mapEventForResponse(event),
    debug: {
      matched_by: matchedBy,
      source,
    },
    live_key: ticket.id || ticket.transaction_id || ticket.qr_code || null,
    booking: null,
  };
}

function buildAlreadyCheckedInResponse(
  member: MemberRow | null,
  ticket: LocalXceedTicket,
  event: EventPolicy | null,
  matchedBy: "email" | "phone" | "name" | null,
  source: "xceed_tickets" | "xceed_raw"
): DoorApiResponse {
  const split = splitFullName(ticket.full_name);
  const full =
    member
      ? fullName(member.first_name, member.last_name)
      : ticket.full_name || fullName(split.firstName, split.lastName);

  const memberNeedsWally =
    !member ||
    (Boolean(event?.require_active_membership) &&
      !isMembershipActive(member));

  return {
    ok: true,
    result: "ALREADY_CHECKED_IN",
    title: "CHECK-IN REGISTRATO",
    message: "Scansione Xceed Acquisita correttamente.",
    badge: "Check-in",
    action: memberNeedsWally ? "OPEN_WALLY" : undefined,
    action_url: memberNeedsWally ? WALLY_URL : undefined,
    person: {
      first_name: member?.first_name ?? split.firstName ?? null,
      last_name: member?.last_name ?? split.lastName ?? null,
      full_name: full || null,
      email: member?.email ?? ticket.email ?? null,
      phone: member?.phone ?? ticket.phone ?? null,
    },
    member: member ? mapMemberForResponse(member) : null,
    ticket: mapTicketForResponse(ticket),
    event: mapEventForResponse(event),
    debug: {
      matched_by: matchedBy,
      source,
    },
    live_key: ticket.id || ticket.transaction_id || ticket.qr_code || null,
    booking: null,
  };
}

function buildOkResponse(
  result: DoorResult,
  member: MemberRow,
  ticket: LocalXceedTicket,
  event: EventPolicy | null,
  matchedBy: "email" | "phone" | "name" | null,
  source: "xceed_tickets" | "xceed_raw"
): DoorApiResponse {
  let title = "SOCIO";
  let message = "OK PASSA";
  let badge = "Socio";

  if (result === "OK_PRIORITY") {
    title = "LOYALTY";
    message = "PRIORITY PASS";
    badge = "Loyalty";
  }

  if (result === "OK_PRIVILEGED") {
    title = "ACCESSO SPECIAL";
    message = "BADGE DEDICATO";
    badge = member.membership_group || "Privileged";
  }

  return {
    ok: true,
    result,
    title,
    message,
    badge,
    person: {
      first_name: member.first_name,
      last_name: member.last_name,
      full_name: fullName(member.first_name, member.last_name),
      email: member.email,
      phone: member.phone,
    },
    member: mapMemberForResponse(member),
    ticket: mapTicketForResponse(ticket),
    event: mapEventForResponse(event),
    debug: {
      matched_by: matchedBy,
      source,
    },
    live_key: ticket.id || ticket.transaction_id || ticket.qr_code || null,
    booking: null,
  };
}

function decideDoorResult(
  event: EventPolicy | null,
  member: MemberRow | null,
  alreadyCheckedIn: boolean
): DoorResult {
  const requireMembership = Boolean(event?.require_membership);
  const requireActiveMembership = Boolean(event?.require_active_membership);

  if (alreadyCheckedIn) {
    return "ALREADY_CHECKED_IN";
  }

  if (requireMembership && !member) {
    return "DENY_WALLY";
  }

  if (requireActiveMembership) {
    if (!member) return "DENY_WALLY";
    if (!isMembershipActive(member)) return "DENY_RENEWAL";
  }

  if (!member) {
    return "DENY_WALLY";
  }

  const role = getDoorRole(member);

  if (role === "loyalty") return "OK_PRIORITY";
  if (role === "privileged") return "OK_PRIVILEGED";
  return "OK_MEMBER";
}

export async function evaluateDoorXceedLive(
  input: EvaluateDoorXceedLiveInput
): Promise<DoorApiResponse> {
  try {
    const qrCode = String(input?.qrCode || "").trim();
    const xceedRaw = input?.xceedRaw || null;
    const latestCheckedIn = input?.latestCheckedIn === true;
    const eventId = String(input?.eventId || "").trim();

    let ticket: LocalXceedTicket | null = null;
    let source: "xceed_tickets" | "xceed_raw" = "xceed_tickets";

    if (latestCheckedIn) {
      if (!eventId) {
        return buildErrorResponse("eventId mancante");
      }

      ticket = await fetchLatestCheckedInTicketByEventId(eventId);
      source = "xceed_tickets";
    } else if (qrCode) {
      ticket = await fetchLocalXceedTicketByQr(qrCode);
      source = "xceed_tickets";
    }

    if (!ticket && xceedRaw) {
      ticket = await buildLocalTicketFromRaw(xceedRaw);
      source = "xceed_raw";
    }

    console.log("DOOR DEBUG LOCAL TICKET", {
      source,
      latestCheckedIn,
      eventId: eventId || null,
      inputQr: qrCode || null,
      ticketQr: ticket?.qr_code ?? null,
      fullName: ticket?.full_name ?? null,
      email: ticket?.email ?? null,
      buyerEmail: ticket?.buyer_email ?? null,
      phone: ticket?.phone ?? null,
      localEventId: ticket?.event_id ?? null,
      status: ticket?.status ?? null,
      checkedIn: ticket ? isAlreadyCheckedInFromLocalTicket(ticket) : null,
    });

    if (!ticket) {
      return buildErrorResponse(
        latestCheckedIn
          ? "Nessun ticket checked_in trovato per questo evento"
          : "QR non presente in xceed_tickets"
      );
    }

    let eventPolicy = await fetchEventPolicyByLocalEventId(ticket.event_id);

    if (!eventPolicy) {
      const xceedEventId =
        ticket.raw?.booking?.event?.id ??
        ticket.raw?.xceed_event_uuid ??
        null;
      eventPolicy = await fetchEventPolicyByXceedEventId(xceedEventId);
    }

    const { member, matchedBy } = await matchMemberFromLocalTicket(ticket);
    const bookingStats = await getBookingStats(ticket);
    const alreadyCheckedIn = isAlreadyCheckedInFromLocalTicket(ticket);
    const result = decideDoorResult(eventPolicy, member, alreadyCheckedIn);

    if (result === "DENY_WALLY") {
      const payload = buildDenyWallyResponse(
        ticket,
        eventPolicy,
        matchedBy,
        source
      );
      return attachBooking(payload, bookingStats);
    }

    if (result === "DENY_RENEWAL") {
      const payload = buildDenyRenewalResponse(
        member as MemberRow,
        ticket,
        eventPolicy,
        matchedBy,
        source
      );
      return attachBooking(payload, bookingStats);
    }

    if (result === "ALREADY_CHECKED_IN") {
      const payload = buildAlreadyCheckedInResponse(
        member,
        ticket,
        eventPolicy,
        matchedBy,
        source
      );
      return attachBooking(payload, bookingStats);
    }

    const payload = buildOkResponse(
      result,
      member as MemberRow,
      ticket,
      eventPolicy,
      matchedBy,
      source
    );

    return attachBooking(payload, bookingStats);
  } catch (error: any) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : JSON.stringify(error, null, 2);

    console.error("DOOR XCEED LIVE EVALUATE ERROR", {
      error,
      message,
    });

    return buildErrorResponse("Errore interno", message);
  }
}