import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

type DoorcheckBody = {
  event_id?: string;
  event_ref?: string;
  mode?: "scan" | "manual";
  qr?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  device_id?: string;
};

type MembershipInfo = {
  member_found: boolean;
  member_group: "ordinary" | "loyalty" | "staff" | null;
  member_group_label: string | null;
  priority_access: boolean;
  member_active_for_access: boolean;
  member_access_note: string | null;
  member_status_raw: string | null;
  eligible_for_membership_invite: boolean;
};

type UiInfo = {
  type: "ETS" | "XCEED" | "SRL" | "UNKNOWN";
  color: "green" | "red" | "blue" | "gold" | "gray";
  badge: string;
};

type XceedTicketMeta = {
  ticket_type: string | null;
  ticket_type_label: string | null;
  ticket_offer_title: string | null;
  ticket_offer_description: string | null;
};

type DoorAlert = {
  show: boolean;
  level: "info" | "warning" | "priority";
  code:
    | "xceed_not_member"
    | "xceed_priority_loyalty"
    | "xceed_priority_member"
    | "xceed_standard_ticket";
  title: string;
  message: string;
  cta_label?: string | null;
  cta_action?: "open_membership_qr" | null;
};

const NO_MEMBERSHIP: MembershipInfo = {
  member_found: false,
  member_group: null,
  member_group_label: null,
  priority_access: false,
  member_active_for_access: false,
  member_access_note: null,
  member_status_raw: null,
  eligible_for_membership_invite: false,
};

function isDigitsOnly(s: string) {
  return /^[0-9]+$/.test(s);
}

function normalizeEmail(email: string | null | undefined) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return null;
  if (!e.includes("@") || !e.includes(".")) return null;
  return e;
}

function normalizePhone(phone: string | null | undefined) {
  let p = String(phone ?? "").trim();
  if (!p) return null;
  p = p.replace(/[^\d+]/g, "");
  if (!p) return null;
  if (/^39\d{8,}$/.test(p)) p = `+${p}`;
  return p.length >= 6 ? p : null;
}

function buildFullName(first: string | null | undefined, last: string | null | undefined) {
  const fn = (first || "").trim();
  const ln = (last || "").trim();
  const joined = `${fn} ${ln}`.trim();
  return joined || null;
}

function asString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseMaybeJson(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeTicketType(input: string | null | undefined): string | null {
  const v = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (!v) return null;
  if (v === "guestlist" || v === "guest-list") return "guest-list";
  if (v === "ticket") return "ticket";
  return v;
}

function ticketTypeLabel(input: string | null | undefined): string | null {
  const t = normalizeTicketType(input);
  if (!t) return null;

  if (t === "guest-list") return "Guest List";
  if (t === "ticket") return "Ticket";

  return t
    .split("-")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

function toHumanMessage(input: { kind?: string; status?: string; reason?: string }): string {
  const reason = (input.reason || "").trim();

  switch (reason) {
    case "missing_ticket":
      return "Accesso negato: socio trovato, ma manca un biglietto valido per questo evento.";
    case "not_a_member":
      return "Accesso negato: biglietto trovato, ma la persona non risulta socia (membership richiesta).";
    case "ambiguous_member_match":
      return "Accesso negato: trovato più di un socio con questi dati (email/telefono). Verificare manualmente.";
    case "not_found":
      return "Accesso negato: nessun biglietto valido per questo evento.";
    default:
      break;
  }

  const status = (input.status || "").toLowerCase();
  if (status.includes("already")) return "Già entrato (check-in già registrato).";
  if (status.includes("denied")) return "Accesso negato.";
  if (status.includes("checked")) return "OK: check-in registrato.";
  return "";
}

function getXceedRawField(rawInput: any, keys: string[]): string | null {
  const raw = parseMaybeJson(rawInput);
  if (!raw || typeof raw !== "object") return null;

  for (const k of keys) {
    if ((raw as any)[k] !== undefined && (raw as any)[k] !== null) {
      const s = asString((raw as any)[k]);
      if (s) return s;
    }
  }
  return null;
}

function pickFirstString(values: Array<any>): string | null {
  for (const v of values) {
    const s = asString(v);
    if (s) return s;
  }
  return null;
}

function extractXceedTicketMeta(rawInput: any): XceedTicketMeta {
  const raw = parseMaybeJson(rawInput);

  const ticketTypeRaw = pickFirstString([
    raw?.ticket?.offer?.type,
    raw?.booking?.offer?.type,
    raw?.offer?.type,
    raw?.ticket?.type,
    raw?.booking?.type,
    getXceedRawField(raw, ["Offer type", "Offer Type", "offer_type", "offerType"]),
  ]);

  const offerTitle = pickFirstString([
    raw?.ticket?.offer?.name,
    raw?.booking?.offer?.name,
    raw?.offer?.name,
    getXceedRawField(raw, ["Offer title", "Offer Title", "offer_title", "offerTitle"]),
  ]);

  const offerDescription = pickFirstString([
    raw?.ticket?.offer?.description,
    raw?.booking?.offer?.description,
    raw?.offer?.description,
    getXceedRawField(raw, [
      "Offer Description",
      "Offer description",
      "offer_description",
      "offerDescription",
    ]),
  ]);

  const ticket_type = normalizeTicketType(ticketTypeRaw);
  const ticket_type_label = ticketTypeLabel(ticket_type);

  return {
    ticket_type,
    ticket_type_label,
    ticket_offer_title: offerTitle,
    ticket_offer_description: offerDescription,
  };
}

function buildMembershipInfo(params: {
  membershipGroup?: string | null;
  status?: string | null;
  requireActiveMembership?: boolean;
  inviteEligible?: boolean;
}): MembershipInfo {
  const rawGroup = String(params.membershipGroup || "").trim();
  const group = rawGroup.toLowerCase();
  const status = String(params.status || "").trim() || null;
  const statusNorm = String(status || "").trim().toLowerCase();
  const requireActiveMembership = Boolean(params.requireActiveMembership);
  const inviteEligible = Boolean(params.inviteEligible);

  let member_group: MembershipInfo["member_group"] = null;
  let member_group_label: string | null = null;
  let priority_access = false;

  if (
    group === "soci ordinari" ||
    group === "socio ordinario" ||
    group === "socio" ||
    group === "member" ||
    group === "membro"
  ) {
    member_group = "ordinary";
    member_group_label = rawGroup || "Socio";
  } else if (
    group === "loyalty clubber" ||
    group === "loyalty" ||
    group === "gold" ||
    group === "vip"
  ) {
    member_group = "loyalty";
    member_group_label = rawGroup || "Loyalty Clubber";
    priority_access = true;
  } else if (group === "staff" || group === "team" || group === "crew") {
    member_group = "staff";
    member_group_label = rawGroup || "Staff";
    priority_access = true;
  }

  const hasRecognizedGroup = !!member_group_label;
  const hasMembershipStatus =
    statusNorm === "attiva" ||
    statusNorm === "active" ||
    statusNorm === "non attiva" ||
    statusNorm === "inactive" ||
    statusNorm === "pending" ||
    statusNorm === "suspended";

  const member_found = hasRecognizedGroup || hasMembershipStatus;

  let member_active_for_access = false;
  let member_access_note: string | null = null;

  if (!member_found) {
    member_active_for_access = false;
    member_access_note = null;
  } else if (!requireActiveMembership) {
    member_active_for_access = true;
    member_access_note = "membership recognized; active check not enforced";
  } else if (statusNorm === "attiva" || statusNorm === "active") {
    member_active_for_access = true;
    member_access_note = "membership active";
  } else {
    member_active_for_access = false;
    member_access_note = "membership not active";
  }

  return {
    member_found,
    member_group,
    member_group_label,
    priority_access,
    member_active_for_access,
    member_access_note,
    member_status_raw: status,
    eligible_for_membership_invite: !member_found && inviteEligible,
  };
}

function normText(v: unknown) {
  return String(v || "").trim();
}

function normKey(v: unknown) {
  return normText(v)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(haystack: unknown, needles: string[]) {
  const h = normKey(haystack);
  if (!h) return false;
  return needles.some((n) => h.includes(normKey(n)));
}

function isPriorityOffer(params: {
  ticketType?: string | null;
  ticketTypeLabel?: string | null;
  offerTitle?: string | null;
  offerDescription?: string | null;
  memberGroup?: string | null;
  memberGroupLabel?: string | null;
  priorityAccess?: boolean | null;
}) {
  if (params.priorityAccess) return true;

  const values = [
    params.ticketType,
    params.ticketTypeLabel,
    params.offerTitle,
    params.offerDescription,
    params.memberGroup,
    params.memberGroupLabel,
  ];

  const priorityHints = [
    "loyalty",
    "loyalty club",
    "priority",
    "priority access",
    "gold",
    "gold access",
    "member priority",
    "fast lane",
    "skip line",
    "ora dorata",
    "tramonto access",
  ];

  return values.some((v) => containsAny(v, priorityHints));
}

function buildDoorAlert(params: {
  kind?: string | null;
  memberFound?: boolean | null;
  memberGroup?: string | null;
  memberGroupLabel?: string | null;
  priorityAccess?: boolean | null;
  membershipInviteUrl?: string | null;
  ticketType?: string | null;
  ticketTypeLabel?: string | null;
  offerTitle?: string | null;
  offerDescription?: string | null;
}): DoorAlert | null {
  const kind = normText(params.kind).toUpperCase();
  if (kind !== "XCEED") return null;

  const memberFound = !!params.memberFound;
  const inviteUrl = normText(params.membershipInviteUrl);
  const isPriority = isPriorityOffer({
    ticketType: params.ticketType,
    ticketTypeLabel: params.ticketTypeLabel,
    offerTitle: params.offerTitle,
    offerDescription: params.offerDescription,
    memberGroup: params.memberGroup,
    memberGroupLabel: params.memberGroupLabel,
    priorityAccess: params.priorityAccess,
  });

  if (!memberFound) {
    return {
      show: true,
      level: "warning",
      code: "xceed_not_member",
      title: "NON SOCIO",
      message: inviteUrl
        ? "Check-in Xceed rilevato. La persona non risulta socio: far completare subito la tessera."
        : "Check-in Xceed rilevato. La persona non risulta socio.",
      cta_label: inviteUrl ? "Apri iscrizione" : null,
      cta_action: inviteUrl ? "open_membership_qr" : null,
    };
  }

  if (isPriority) {
    return {
      show: true,
      level: "priority",
      code: "xceed_priority_loyalty",
      title: "PRIORITY ACCESS",
      message: "Ticket / profilo prioritario rilevato. Gestire accesso preferenziale.",
      cta_label: null,
      cta_action: null,
    };
  }

  return {
    show: true,
    level: "info",
    code: "xceed_standard_ticket",
    title: "TICKET STANDARD",
    message: "Check-in Xceed valido senza priorità speciale.",
    cta_label: null,
    cta_action: null,
  };
}

function attachDoorAlert<T extends Record<string, any>>(resp: T): T & { door_alert?: DoorAlert | null } {
  const door_alert = buildDoorAlert({
    kind: resp.kind ?? null,
    memberFound: resp.member_found ?? null,
    memberGroup: resp.member_group ?? null,
    memberGroupLabel: resp.member_group_label ?? null,
    priorityAccess: resp.priority_access ?? null,
    membershipInviteUrl: resp.membership_invite_url ?? null,
    ticketType: resp.ticket_type ?? null,
    ticketTypeLabel: resp.ticket_type_label ?? null,
    offerTitle: resp.ticket_offer_title ?? null,
    offerDescription: resp.ticket_offer_description ?? null,
  });

  return {
    ...resp,
    door_alert,
  };
}
function buildUiInfo(params: {
  kind: "ETS" | "XCEED" | "SRL" | "UNKNOWN";
  allowed: boolean;
  memberGroupLabel?: string | null;
  priorityAccess?: boolean;
  ticketOfferTitle?: string | null;
  ticketTypeLabel?: string | null;
}): UiInfo {
  const kind = params.kind;
  const allowed = Boolean(params.allowed);
  const memberGroupLabel = String(params.memberGroupLabel || "").trim();
  const priorityAccess = Boolean(params.priorityAccess);
  const ticketOfferTitle = String(params.ticketOfferTitle || "").trim();
  const ticketTypeLabel = String(params.ticketTypeLabel || "").trim();

  if (!allowed) {
    return {
      type: kind,
      color: "red",
      badge: memberGroupLabel || ticketTypeLabel || ticketOfferTitle || kind,
    };
  }

  if (kind === "ETS") {
    if (priorityAccess) {
      return {
        type: "ETS",
        color: "gold",
        badge: memberGroupLabel || "Socio priority",
      };
    }
    return {
      type: "ETS",
      color: "green",
      badge: memberGroupLabel || "Socio",
    };
  }

  if (kind === "XCEED") {
    return {
      type: "XCEED",
      color: "blue",
      badge: ticketTypeLabel || ticketOfferTitle || "Ticket Xceed",
    };
  }

  if (kind === "SRL") {
    return {
      type: "SRL",
      color: "gray",
      badge: "Guest / SRL",
    };
  }

  return {
    type: "UNKNOWN",
    color: "red",
    badge: "Non trovato",
  };
}

async function isDoorApiKeyValid(supabase: ReturnType<typeof supabaseAdmin>, apiKey: string) {
  const k = (apiKey || "").trim();
  if (!k) return false;

  const { data, error } = await supabase
    .from("door_api_keys")
    .select("id")
    .eq("active", true)
    .eq("api_key", k)
    .limit(1);

  if (error) throw new Error(error.message);
  return !!(data && data.length > 0);
}

async function resolveEventId(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string | null,
  eventRef: string | null
) {
  const eid = (eventId || "").trim();
  if (eid) {
    const { data: ev, error: evErr } = await supabase.from("events").select("id").eq("id", eid).maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev) return null;
    return ev.id as string;
  }

  const ref = (eventRef || "").trim();
  if (!ref) return null;

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("id")
    .eq("xceed_event_ref", ref)
    .maybeSingle();

  if (evErr) throw new Error(evErr.message);
  if (!ev) return null;
  return ev.id as string;
}

async function getEventPolicy(supabase: ReturnType<typeof supabaseAdmin>, eventId: string) {
  const { data: ev, error } = await supabase
    .from("events")
    .select("id, require_ticket, require_membership, require_active_membership")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    require_ticket: Boolean((ev as any)?.require_ticket),
    require_membership: Boolean((ev as any)?.require_membership),
    require_active_membership: Boolean((ev as any)?.require_active_membership),
  };
}

async function findMemberByBarcodeOrCard(
  supabase: ReturnType<typeof supabaseAdmin>,
  qrRaw: string
): Promise<{
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  membership_group: string | null;
  status: string | null;
} | null> {
  if (isDigitsOnly(qrRaw)) {
    const { data: m, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, phone, membership_group, status")
      .eq("legacy_barcode", qrRaw)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!m) return null;

    return {
      id: (m as any).id,
      display_name: buildFullName((m as any).first_name, (m as any).last_name),
      email: (m as any).email ?? null,
      phone: (m as any).phone ?? null,
      membership_group: (m as any).membership_group ?? null,
      status: (m as any).status ?? null,
    };
  }

  const { data: card, error: cErr } = await supabase
    .from("member_cards")
    .select("member_id, revoked")
    .eq("qr_secret", qrRaw)
    .maybeSingle();

  if (cErr) throw new Error(cErr.message);
  if (!card) return null;
  if ((card as any).revoked) return null;

  const { data: m, error: mErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, phone, membership_group, status")
    .eq("id", (card as any).member_id)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!m) return null;

  return {
    id: (m as any).id,
    display_name: buildFullName((m as any).first_name, (m as any).last_name),
    email: (m as any).email ?? null,
    phone: (m as any).phone ?? null,
    membership_group: (m as any).membership_group ?? null,
    status: (m as any).status ?? null,
  };
}

async function memberAlreadyCheckedIn(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("checkins")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", memberId)
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return (data[0] as any).id as string;
}

async function legacyAlreadyCheckedIn(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  legacyPersonId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("checkins")
    .select("id")
    .eq("event_id", eventId)
    .eq("legacy_person_id", legacyPersonId)
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return (data[0] as any).id as string;
}

async function resolveMemberByEmailOrPhone(
  supabase: ReturnType<typeof supabaseAdmin>,
  emailNorm: string | null,
  phoneNorm: string | null
): Promise<
  | {
      id: string;
      display_name: string | null;
      membership_group: string | null;
      status: string | null;
    }
  | { ambiguous: true }
  | null
> {
  if (emailNorm) {
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, membership_group, status")
      .ilike("email", emailNorm)
      .limit(2);

    if (error) throw new Error(error.message);
    if (data && data.length === 1) {
      const m = data[0] as any;
      return {
        id: m.id as string,
        display_name: buildFullName(m.first_name, m.last_name),
        membership_group: m.membership_group ?? null,
        status: m.status ?? null,
      };
    }
    if (data && data.length > 1) return { ambiguous: true };
  }

  if (phoneNorm) {
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, membership_group, status")
      .eq("phone", phoneNorm)
      .limit(2);

    if (error) throw new Error(error.message);
    if (data && data.length === 1) {
      const m = data[0] as any;
      return {
        id: m.id as string,
        display_name: buildFullName(m.first_name, m.last_name),
        membership_group: m.membership_group ?? null,
        status: m.status ?? null,
      };
    }
    if (data && data.length > 1) return { ambiguous: true };
  }

  return null;
}

async function memberHasAvailableTicketForEvent(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  email: string | null,
  phone: string | null
): Promise<boolean> {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  if (!e && !p) return false;

  let q = supabase
    .from("xceed_tickets")
    .select("id")
    .eq("event_id", eventId)
    .is("checkin_id", null)
    .limit(1);

  if (e) {
    q = q.or(`buyer_email_norm.eq.${e},email.ilike.${e}`);
  } else if (p) {
    q = q.or(`buyer_phone_norm.eq.${p},phone.eq.${p}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return !!(data && data.length > 0);
}

async function linkMemberTicketToCheckin(params: {
  supabase: ReturnType<typeof supabaseAdmin>;
  eventId: string;
  checkinId: string;
  email: string | null;
  phone: string | null;
}) {
  const { supabase, eventId, checkinId, email, phone } = params;
  if (!checkinId) return;

  const e = normalizeEmail(email);
  if (e) {
    const { data: t, error: tErr } = await supabase
      .from("xceed_tickets")
      .select("id")
      .eq("event_id", eventId)
      .is("checkin_id", null)
      .or(`buyer_email_norm.eq.${e},email.ilike.${e}`)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tErr) throw new Error(tErr.message);

    if ((t as any)?.id) {
      const { error: updErr } = await supabase
        .from("xceed_tickets")
        .update({ checkin_id: checkinId })
        .eq("id", (t as any).id);

      if (updErr) throw new Error(updErr.message);
      return;
    }
  }

  const p = normalizePhone(phone);
  if (p) {
    const { data: t, error: tErr } = await supabase
      .from("xceed_tickets")
      .select("id")
      .eq("event_id", eventId)
      .is("checkin_id", null)
      .or(`buyer_phone_norm.eq.${p},phone.eq.${p}`)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tErr) throw new Error(tErr.message);

    if ((t as any)?.id) {
      const { error: updErr } = await supabase
        .from("xceed_tickets")
        .update({ checkin_id: checkinId })
        .eq("id", (t as any).id);

      if (updErr) throw new Error(updErr.message);
      return;
    }
  }
}

async function upsertLegacyPerson(
  supabase: ReturnType<typeof supabaseAdmin>,
  payload: { source: "guest"; full_name: string | null; email: string | null; phone: string | null }
) {
  if (payload.email) {
    const { data: ex, error: exErr } = await supabase
      .from("legacy_people")
      .select("id, full_name")
      .eq("source", payload.source)
      .ilike("email", payload.email)
      .maybeSingle();

    if (exErr) throw new Error(exErr.message);

    if ((ex as any)?.id) {
      const { data: upd, error: updErr } = await supabase
        .from("legacy_people")
        .update({
          full_name: payload.full_name || (ex as any).full_name || null,
          phone: payload.phone || null,
        })
        .eq("id", (ex as any).id)
        .select("id, full_name")
        .maybeSingle();

      if (updErr) throw new Error(updErr.message);
      return { id: (upd as any).id as string, full_name: (upd as any).full_name as string | null };
    }
  }

  if (!payload.email && payload.phone) {
    const { data: ex, error: exErr } = await supabase
      .from("legacy_people")
      .select("id, full_name")
      .eq("source", payload.source)
      .eq("phone", payload.phone)
      .maybeSingle();

    if (exErr) throw new Error(exErr.message);

    if ((ex as any)?.id) {
      const { data: upd, error: updErr } = await supabase
        .from("legacy_people")
        .update({
          full_name: payload.full_name || (ex as any).full_name || null,
          email: payload.email || null,
        })
        .eq("id", (ex as any).id)
        .select("id, full_name")
        .maybeSingle();

      if (updErr) throw new Error(updErr.message);
      return { id: (upd as any).id as string, full_name: (upd as any).full_name as string | null };
    }
  }

  const { data: ins, error: insErr } = await supabase
    .from("legacy_people")
    .insert({
      source: payload.source,
      full_name: payload.full_name || null,
      email: payload.email || null,
      phone: payload.phone || null,
    })
    .select("id, full_name")
    .maybeSingle();

  if (insErr) throw new Error(insErr.message);
  return { id: (ins as any).id as string, full_name: (ins as any).full_name as string | null };
}
export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const got = (req.headers.get("x-api-key") || "").trim();
    if (!got) return unauthorized("Missing API key");

    const ok = await isDoorApiKeyValid(supabase, got);
    if (!ok) return unauthorized("Invalid API key");

    const body = (await req.json()) as DoorcheckBody;

    const eventId = await resolveEventId(supabase, body.event_id || null, body.event_ref || null);
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    }

    const policy = await getEventPolicy(supabase, eventId);

    const mode = (body.mode || "scan").trim() as "scan" | "manual";
    const qrRaw = (body.qr || "").trim();

    if (mode === "scan" && !qrRaw) {
      return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });
    }

    if (mode === "manual") {
      const fullName = (body.full_name || "").trim();
      const phoneNorm = normalizePhone(body.phone || null);
      const emailNorm = normalizeEmail(body.email || null);

      if (!fullName && !phoneNorm) {
        return NextResponse.json({ ok: false, error: "Missing full_name or phone" }, { status: 400 });
      }

      const scanned_code = qrRaw || (phoneNorm ? `MANUAL:${phoneNorm}` : "MANUAL");

      let manualXceedTicket: any | null = null;
      if (qrRaw && !qrRaw.startsWith("MANUAL")) {
        const { data: t, error: tErr } = await supabase
          .from("xceed_tickets")
          .select("id, checkin_id, legacy_person_id, full_name, email, phone, transaction_id, booking_date, raw")
          .eq("event_id", eventId)
          .eq("qr_code", qrRaw)
          .maybeSingle();

        if (tErr) throw new Error(tErr.message);
        if ((t as any)?.id) manualXceedTicket = t;

        const tMeta = extractXceedTicketMeta((t as any)?.raw);
        const tCheckinId = String((t as any)?.checkin_id ?? "").trim();

        if (tCheckinId) {
          const nm = String((t as any)?.full_name ?? "").trim() || fullName || "Xceed guest";
          const resp: any = {
            ok: true,
            allowed: true,
            kind: "XCEED",
            status: "Already Checked IN",
            checkin_id: tCheckinId,
            legacy_person_id: (t as any)?.legacy_person_id ?? null,
            display_name: nm,
            ticket_offer_title: tMeta.ticket_offer_title,
            ticket_offer_description: tMeta.ticket_offer_description,
            ticket_transaction_id: asString((t as any)?.transaction_id) || null,
            ticket_booking_date: (t as any)?.booking_date || null,
            ticket_type: tMeta.ticket_type,
            ticket_type_label: tMeta.ticket_type_label,
            ...NO_MEMBERSHIP,
            ui: buildUiInfo({
              kind: "XCEED",
              allowed: true,
              ticketOfferTitle: tMeta.ticket_offer_title,
              ticketTypeLabel: tMeta.ticket_type_label,
            }),
          };
          resp.message = toHumanMessage(resp);
          return NextResponse.json(attachDoorAlert(resp));
        }
      }

      const legacy = await upsertLegacyPerson(supabase, {
        source: "guest",
        full_name: fullName || null,
        email: emailNorm,
        phone: phoneNorm,
      });

      const alreadyId = await legacyAlreadyCheckedIn(supabase, eventId, legacy.id);
      if (alreadyId) {
        if (manualXceedTicket?.id) {
          const { error: updErr } = await supabase
            .from("xceed_tickets")
            .update({ checkin_id: alreadyId, legacy_person_id: legacy.id })
            .eq("id", (manualXceedTicket as any).id);
          if (updErr) throw new Error(updErr.message);
        }

        const resp: any = {
          ok: true,
          allowed: true,
          kind: "SRL",
          status: "Already Checked IN",
          checkin_id: alreadyId,
          legacy_person_id: legacy.id,
          display_name: fullName || (legacy as any)?.full_name || null,
          scanned_code,
          ...NO_MEMBERSHIP,
          ui: buildUiInfo({
            kind: "SRL",
            allowed: true,
          }),
        };
        resp.message = toHumanMessage(resp);
        return NextResponse.json(resp);
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: legacy.id,
          result: "allowed",
          reason: "srl_created",
          method: "lv_manual",
          kind: "SRL",
          scanned_code,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      const newCheckinId = (ins as any)?.id || null;

      if (manualXceedTicket?.id && newCheckinId) {
        const { error: updErr } = await supabase
          .from("xceed_tickets")
          .update({ checkin_id: newCheckinId, legacy_person_id: legacy.id })
          .eq("id", (manualXceedTicket as any).id);
        if (updErr) throw new Error(updErr.message);
      }

      const resp: any = {
        ok: true,
        allowed: true,
        kind: "SRL",
        status: "created_and_checked_in",
        checkin_id: newCheckinId,
        legacy_person_id: legacy.id,
        display_name: fullName || null,
        scanned_code,
        ...NO_MEMBERSHIP,
        ui: buildUiInfo({
          kind: "SRL",
          allowed: true,
        }),
      };
      resp.message = toHumanMessage(resp);
      return NextResponse.json(resp);
    }

    if (!qrRaw) {
      return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });
    }

    const member = await findMemberByBarcodeOrCard(supabase, qrRaw);
    const etsMembershipInfo = member
      ? buildMembershipInfo({
          membershipGroup: member.membership_group,
          status: member.status,
          requireActiveMembership: policy.require_active_membership,
          inviteEligible: false,
        })
      : { ...NO_MEMBERSHIP };

    if (member) {
      const alreadyId = await memberAlreadyCheckedIn(supabase, eventId, member.id);
      if (alreadyId) {
        if (policy.require_ticket) {
          await linkMemberTicketToCheckin({
            supabase,
            eventId,
            checkinId: alreadyId,
            email: normalizeEmail(member.email),
            phone: normalizePhone(member.phone),
          });
        }

        const resp: any = {
          ok: true,
          allowed: true,
          kind: "ETS",
          status: "Already Checked IN",
          member_id: member.id,
          display_name: member.display_name,
          checkin_id: alreadyId,
          ...etsMembershipInfo,
          ui: buildUiInfo({
            kind: "ETS",
            allowed: true,
            memberGroupLabel: etsMembershipInfo.member_group_label,
            priorityAccess: etsMembershipInfo.priority_access,
          }),
        };
        resp.message = toHumanMessage(resp);
        return NextResponse.json(resp);
      }

      if (policy.require_ticket) {
        const hasTicket = await memberHasAvailableTicketForEvent(
          supabase,
          eventId,
          normalizeEmail(member.email),
          normalizePhone(member.phone)
        );

        if (!hasTicket) {
          const resp: any = {
            ok: true,
            allowed: false,
            kind: "ETS",
            status: "denied",
            reason: "missing_ticket",
            member_id: member.id,
            display_name: member.display_name,
            ...etsMembershipInfo,
            ui: buildUiInfo({
              kind: "ETS",
              allowed: false,
              memberGroupLabel: etsMembershipInfo.member_group_label,
              priorityAccess: etsMembershipInfo.priority_access,
            }),
          };
          resp.message = toHumanMessage(resp);
          return NextResponse.json(resp);
        }
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          member_id: member.id,
          result: "allowed",
          reason: policy.require_ticket ? "ets_ok_ticket_ok" : "ets_ok",
          method: isDigitsOnly(qrRaw) ? "wally_barcode" : "lv_qr",
          kind: "ETS",
          scanned_code: qrRaw,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      const newCheckinId = (ins as any)?.id || null;

      if (policy.require_ticket && newCheckinId) {
        await linkMemberTicketToCheckin({
          supabase,
          eventId,
          checkinId: newCheckinId,
          email: normalizeEmail(member.email),
          phone: normalizePhone(member.phone),
        });
      }

      const resp: any = {
        ok: true,
        allowed: true,
        kind: "ETS",
        status: "checked_in",
        member_id: member.id,
        checkin_id: newCheckinId,
        display_name: member.display_name,
        ...etsMembershipInfo,
        ui: buildUiInfo({
          kind: "ETS",
          allowed: true,
          memberGroupLabel: etsMembershipInfo.member_group_label,
          priorityAccess: etsMembershipInfo.priority_access,
        }),
      };
      resp.message = toHumanMessage(resp);
      return NextResponse.json(resp);
    }

    const { data: ticket, error: tErr } = await supabase
      .from("xceed_tickets")
      .select("id, checkin_id, legacy_person_id, full_name, email, phone, transaction_id, booking_date, raw")
      .eq("event_id", eventId)
      .eq("qr_code", qrRaw)
      .maybeSingle();

    if (tErr) throw new Error(tErr.message);

    if (ticket?.id) {
      const buyerName = String((ticket as any).full_name ?? "").trim() || "Xceed guest";
      const buyerEmail = normalizeEmail((ticket as any).email ?? null);
      const buyerPhone = normalizePhone((ticket as any).phone ?? null);

      const ticketMeta = extractXceedTicketMeta((ticket as any).raw);
      const ticket_transaction_id = asString((ticket as any).transaction_id) || null;
      const ticket_booking_date = (ticket as any).booking_date || null;

      const ticketCheckinId = String((ticket as any).checkin_id ?? "").trim();
      if (ticketCheckinId) {
        const resolvedMember = await resolveMemberByEmailOrPhone(supabase, buyerEmail, buyerPhone);

        const alreadyCheckedMembershipInfo =
          !resolvedMember || (resolvedMember as any).ambiguous
            ? buildMembershipInfo({
                membershipGroup: null,
                status: null,
                requireActiveMembership: policy.require_active_membership,
                inviteEligible: !!buyerEmail,
              })
            : buildMembershipInfo({
                membershipGroup: (resolvedMember as any).membership_group,
                status: (resolvedMember as any).status,
                requireActiveMembership: policy.require_active_membership,
                inviteEligible: false,
              });

        const resolvedKind =
          resolvedMember && !(resolvedMember as any).ambiguous ? "ETS" : "XCEED";

        const resp: any = {
          ok: true,
          allowed: true,
          kind: resolvedKind,
          status: "Already Checked IN",
          checkin_id: ticketCheckinId,
          member_id: resolvedKind === "ETS" ? (resolvedMember as any).id : null,
          legacy_person_id: resolvedKind === "ETS" ? null : (ticket as any).legacy_person_id ?? null,
          display_name:
            resolvedKind === "ETS"
              ? (resolvedMember as any).display_name || buyerName
              : buyerName,
          ...alreadyCheckedMembershipInfo,
          ticket_offer_title: ticketMeta.ticket_offer_title,
          ticket_offer_description: ticketMeta.ticket_offer_description,
          ticket_transaction_id,
          ticket_booking_date,
          ticket_type: ticketMeta.ticket_type,
          ticket_type_label: ticketMeta.ticket_type_label,
          ticket_offer_type_debug: {
            from_label: ticketMeta.ticket_type_label,
            from_type: ticketMeta.ticket_type,
            raw_offer_type:
              parseMaybeJson((ticket as any).raw)?.offer?.type ??
              parseMaybeJson((ticket as any).raw)?.ticket?.offer?.type ??
              parseMaybeJson((ticket as any).raw)?.booking?.offer?.type ??
              null,
          },
          ui: buildUiInfo({
            kind: resolvedKind,
            allowed: true,
            memberGroupLabel: alreadyCheckedMembershipInfo.member_group_label,
            priorityAccess: alreadyCheckedMembershipInfo.priority_access,
            ticketOfferTitle: ticketMeta.ticket_offer_title,
            ticketTypeLabel: ticketMeta.ticket_type_label,
          }),
        };

        resp.message = toHumanMessage(resp);
        return NextResponse.json(resolvedKind === "XCEED" ? attachDoorAlert(resp) : resp);
      }

      if (policy.require_membership) {
        const m = await resolveMemberByEmailOrPhone(supabase, buyerEmail, buyerPhone);
        const xceedMembershipInfo =
          !m || (m as any).ambiguous
            ? buildMembershipInfo({
                membershipGroup: null,
                status: null,
                requireActiveMembership: policy.require_active_membership,
                inviteEligible: !!buyerEmail,
              })
            : buildMembershipInfo({
                membershipGroup: (m as any).membership_group,
                status: (m as any).status,
                requireActiveMembership: policy.require_active_membership,
                inviteEligible: false,
              });

        if (m && (m as any).ambiguous) {
          const resp: any = {
            ok: true,
            allowed: false,
            kind: "XCEED",
            status: "denied",
            reason: "ambiguous_member_match",
            display_name: buyerName,
            ...xceedMembershipInfo,
            ticket_offer_title: ticketMeta.ticket_offer_title,
            ticket_offer_description: ticketMeta.ticket_offer_description,
            ticket_transaction_id,
            ticket_booking_date,
            ticket_type: ticketMeta.ticket_type,
            ticket_type_label: ticketMeta.ticket_type_label,
            ui: buildUiInfo({
              kind: "XCEED",
              allowed: false,
              memberGroupLabel: xceedMembershipInfo.member_group_label,
              priorityAccess: xceedMembershipInfo.priority_access,
              ticketOfferTitle: ticketMeta.ticket_offer_title,
              ticketTypeLabel: ticketMeta.ticket_type_label,
            }),
          };
          resp.message = toHumanMessage(resp);
          return NextResponse.json(attachDoorAlert(resp));
        }

        if (!m) {
          const resp: any = {
            ok: true,
            allowed: false,
            kind: "XCEED",
            status: "denied",
            reason: "not_a_member",
            display_name: buyerName,
            ...xceedMembershipInfo,
            member_access_note: "not a member",
            membership_invite_url: buyerEmail
              ? `https://www.wallyfor.com/step1.php?ref=1d7439beb34f751e1db481e40592079e`
              : null,
            ticket_offer_title: ticketMeta.ticket_offer_title,
            ticket_offer_description: ticketMeta.ticket_offer_description,
            ticket_transaction_id,
            ticket_booking_date,
            ticket_type: ticketMeta.ticket_type,
            ticket_type_label: ticketMeta.ticket_type_label,
            ui: buildUiInfo({
              kind: "XCEED",
              allowed: false,
              memberGroupLabel: xceedMembershipInfo.member_group_label,
              priorityAccess: xceedMembershipInfo.priority_access,
              ticketOfferTitle: ticketMeta.ticket_offer_title,
              ticketTypeLabel: ticketMeta.ticket_type_label,
            }),
          };
          resp.message = toHumanMessage(resp);
          return NextResponse.json(attachDoorAlert(resp));
        }

        const alreadyEtsId = await memberAlreadyCheckedIn(supabase, eventId, (m as any).id);
        if (alreadyEtsId) {
          await supabase.from("xceed_tickets").update({ checkin_id: alreadyEtsId }).eq("id", (ticket as any).id);

          const resp: any = {
            ok: true,
            allowed: true,
            kind: "ETS",
            status: "Already Checked IN",
            member_id: (m as any).id,
            checkin_id: alreadyEtsId,
            display_name: (m as any).display_name || buyerName,
            ...xceedMembershipInfo,
            ticket_offer_title: ticketMeta.ticket_offer_title,
            ticket_offer_description: ticketMeta.ticket_offer_description,
            ticket_transaction_id,
            ticket_booking_date,
            ticket_type: ticketMeta.ticket_type,
            ticket_type_label: ticketMeta.ticket_type_label,
            ui: buildUiInfo({
              kind: "ETS",
              allowed: true,
              memberGroupLabel: xceedMembershipInfo.member_group_label,
              priorityAccess: xceedMembershipInfo.priority_access,
              ticketOfferTitle: ticketMeta.ticket_offer_title,
              ticketTypeLabel: ticketMeta.ticket_type_label,
            }),
          };
          resp.message = toHumanMessage(resp);
          return NextResponse.json(resp);
        }

        const { data: ins, error: insErr } = await supabase
          .from("checkins")
          .insert({
            event_id: eventId,
            member_id: (m as any).id,
            result: "allowed",
            reason: "ets_via_xceed",
            method: "xceed_qr",
            kind: "ETS",
            scanned_code: qrRaw,
          })
          .select("id")
          .maybeSingle();

        if (insErr) throw new Error(insErr.message);

        await supabase
          .from("xceed_tickets")
          .update({ checkin_id: (ins as any)?.id || null })
          .eq("id", (ticket as any).id);

        const resp: any = {
          ok: true,
          allowed: true,
          kind: "ETS",
          status: "checked_in",
          member_id: (m as any).id,
          checkin_id: (ins as any)?.id || null,
          display_name: (m as any).display_name || buyerName,
          ...xceedMembershipInfo,
          ticket_offer_title: ticketMeta.ticket_offer_title,
          ticket_offer_description: ticketMeta.ticket_offer_description,
          ticket_transaction_id,
          ticket_booking_date,
          ticket_type: ticketMeta.ticket_type,
          ticket_type_label: ticketMeta.ticket_type_label,
          ui: buildUiInfo({
            kind: "ETS",
            allowed: true,
            memberGroupLabel: xceedMembershipInfo.member_group_label,
            priorityAccess: xceedMembershipInfo.priority_access,
            ticketOfferTitle: ticketMeta.ticket_offer_title,
            ticketTypeLabel: ticketMeta.ticket_type_label,
          }),
        };
        resp.message = toHumanMessage(resp);
        return NextResponse.json(resp);
      }

      let legacyPersonId = (ticket as any).legacy_person_id as string | null;

      if (!legacyPersonId) {
        const legacy = await upsertLegacyPerson(supabase, {
          source: "guest",
          full_name: buyerName,
          email: buyerEmail,
          phone: buyerPhone,
        });
        legacyPersonId = legacy.id;

        const { error: updErr } = await supabase
          .from("xceed_tickets")
          .update({ legacy_person_id: legacyPersonId })
          .eq("id", (ticket as any).id);

        if (updErr) throw new Error(updErr.message);
      }

      const alreadyLegacyId = await legacyAlreadyCheckedIn(supabase, eventId, legacyPersonId);
      if (alreadyLegacyId) {
        const xceedGuestAlreadyMembershipInfo = buildMembershipInfo({
          membershipGroup: null,
          status: null,
          requireActiveMembership: policy.require_active_membership,
          inviteEligible: !!buyerEmail,
        });

        await supabase.from("xceed_tickets").update({ checkin_id: alreadyLegacyId }).eq("id", (ticket as any).id);

        const resp: any = {
          ok: true,
          allowed: true,
          kind: "XCEED",
          status: "Already Checked IN",
          legacy_person_id: legacyPersonId,
          checkin_id: alreadyLegacyId,
          display_name: buyerName,
          ...xceedGuestAlreadyMembershipInfo,
          membership_invite_url: buyerEmail
            ? `https://www.wallyfor.com/step1.php?ref=1d7439beb34f751e1db481e40592079e`
            : null,
          ticket_offer_title: ticketMeta.ticket_offer_title,
          ticket_offer_description: ticketMeta.ticket_offer_description,
          ticket_transaction_id,
          ticket_booking_date,
          ticket_type: ticketMeta.ticket_type,
          ticket_type_label: ticketMeta.ticket_type_label,
          ui: buildUiInfo({
            kind: "XCEED",
            allowed: true,
            memberGroupLabel: xceedGuestAlreadyMembershipInfo.member_group_label,
            priorityAccess: xceedGuestAlreadyMembershipInfo.priority_access,
            ticketOfferTitle: ticketMeta.ticket_offer_title,
            ticketTypeLabel: ticketMeta.ticket_type_label,
          }),
        };
        resp.message = toHumanMessage(resp);
        return NextResponse.json(attachDoorAlert(resp));
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: legacyPersonId,
          result: "allowed",
          reason: policy.require_ticket ? "xceed_ok_ticket_ok" : "xceed_ok",
          method: "xceed_qr",
          kind: "XCEED",
          scanned_code: qrRaw,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      await supabase
        .from("xceed_tickets")
        .update({ checkin_id: (ins as any)?.id || null })
        .eq("id", (ticket as any).id);

      const xceedGuestMembershipInfo = buildMembershipInfo({
        membershipGroup: null,
        status: null,
        requireActiveMembership: policy.require_active_membership,
        inviteEligible: !!buyerEmail,
      });

      const resp: any = {
        ok: true,
        allowed: true,
        kind: "XCEED",
        status: "checked_in",
        checkin_id: (ins as any)?.id || null,
        legacy_person_id: legacyPersonId,
        display_name: buyerName,
        ...xceedGuestMembershipInfo,
        membership_invite_url: buyerEmail
          ? `https://www.wallyfor.com/step1.php?ref=1d7439beb34f751e1db481e40592079e`
          : null,
        ticket_offer_title: ticketMeta.ticket_offer_title,
        ticket_offer_description: ticketMeta.ticket_offer_description,
        ticket_transaction_id,
        ticket_booking_date,
        ticket_type: ticketMeta.ticket_type,
        ticket_type_label: ticketMeta.ticket_type_label,
        ui: buildUiInfo({
          kind: "XCEED",
          allowed: true,
          memberGroupLabel: xceedGuestMembershipInfo.member_group_label,
          priorityAccess: xceedGuestMembershipInfo.priority_access,
          ticketOfferTitle: ticketMeta.ticket_offer_title,
          ticketTypeLabel: ticketMeta.ticket_type_label,
        }),
      };
      resp.message = toHumanMessage(resp);
      return NextResponse.json(attachDoorAlert(resp));
    }

    const { data: lp, error: lpErr } = await supabase
      .from("legacy_people")
      .select("id, full_name")
      .eq("legacy_barcode", qrRaw)
      .maybeSingle();

    if (lpErr) throw new Error(lpErr.message);

    if (lp?.id) {
      const alreadyId = await legacyAlreadyCheckedIn(supabase, eventId, (lp as any).id);
      if (alreadyId) {
        const resp: any = {
          ok: true,
          allowed: true,
          kind: "SRL",
          status: "Already Checked IN",
          legacy_person_id: (lp as any).id,
          checkin_id: alreadyId,
          display_name: (lp as any).full_name ?? null,
          ...NO_MEMBERSHIP,
          ui: buildUiInfo({
            kind: "SRL",
            allowed: true,
          }),
        };
        resp.message = toHumanMessage(resp);
        return NextResponse.json(resp);
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: (lp as any).id,
          result: "allowed",
          reason: "srl_ok",
          method: "lv_qr",
          kind: "SRL",
          scanned_code: qrRaw,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      const resp: any = {
        ok: true,
        allowed: true,
        kind: "SRL",
        status: "checked_in",
        checkin_id: (ins as any)?.id || null,
        legacy_person_id: (lp as any).id,
        display_name: (lp as any).full_name ?? null,
        ...NO_MEMBERSHIP,
        ui: buildUiInfo({
          kind: "SRL",
          allowed: true,
        }),
      };
      resp.message = toHumanMessage(resp);
      return NextResponse.json(resp);
    }

    const resp: any = {
      ok: true,
      allowed: false,
      kind: "UNKNOWN",
      status: "denied",
      reason: "not_found",
      ...NO_MEMBERSHIP,
      ui: buildUiInfo({
        kind: "UNKNOWN",
        allowed: false,
      }),
    };
    resp.message = toHumanMessage(resp);
    return NextResponse.json(resp);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export {};