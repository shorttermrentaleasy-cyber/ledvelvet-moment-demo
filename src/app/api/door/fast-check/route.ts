import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  findWallyforMembersByEmail,
  WallyforApiError,
} from "@/lib/wallyfor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FastDecision =
  | "OK_ACCESS"
  | "WRONG_GATE"
  | "NO_TICKET"
  | "MEMBER_NOT_FOUND"
  | "MEMBERSHIP_INACTIVE"
  | "MEMBERSHIP_EXPIRED"
  | "MEMBERSHIP_REVIEW"
  | "MISSING_INPUT"
  | "DB_ERROR"
  | "FATAL_ERROR";

type MemberRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  membership_group: string | null;
  membership_expires_at: string | null;
};

type MemberSource = "wallyfor_api" | "supabase_fallback";

function assertEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

function normalize(value: unknown): string {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown): string {
  return normalize(value).toLowerCase();
}

function normalizeName(value: unknown): string {
  return normalize(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

type DoorRole = "ordinary" | "loyalty" | "privileged";

function normalizeDoorRole(value: unknown): DoorRole | null {
  const role = normalize(value).toLowerCase();
  return role === "ordinary" || role === "loyalty" || role === "privileged"
    ? role
    : null;
}

function getMemberRole(member: MemberRow): DoorRole {
  const group = normalize(member.membership_group).toLowerCase();
  if (group.includes("loyalty")) return "loyalty";
  if (
    group.includes("consiglio direttivo") ||
    group.includes("ledvelvet") ||
    group.includes("staff")
  ) {
    return "privileged";
  }
  return "ordinary";
}

function canUseGate(memberRole: DoorRole, gateRole: DoorRole | null): boolean {
  if (!gateRole || memberRole === "privileged") return true;
  return memberRole === gateRole;
}

function todayIsoDate(): string {
  const now = new Date();

  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function jsonFast(
  ok: boolean,
  decision: FastDecision,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      ok,
      decision,
      message,
      ...(extra || {}),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function extractTicketEmail(raw: any): string | null {
  const candidates = [
    raw?.pass?.email,
    raw?.ticket?.email,
    raw?.ticket?.booking?.email,
    raw?.booking?.buyer?.email,
    raw?.booking?.email,
  ];

  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);

    if (email) {
      return email;
    }
  }

  return null;
}

function extractTicketFirstName(raw: any): string | null {
  const candidates = [
    raw?.pass?.firstName,
    raw?.ticket?.firstName,
    raw?.ticket?.booking?.firstName,
    raw?.booking?.buyer?.firstName,
    raw?.booking?.firstName,
  ];

  for (const candidate of candidates) {
    const firstName = normalize(candidate);

    if (firstName) {
      return firstName;
    }
  }

  return null;
}

function extractTicketLastName(raw: any): string | null {
  const candidates = [
    raw?.pass?.lastName,
    raw?.ticket?.lastName,
    raw?.ticket?.booking?.lastName,
    raw?.booking?.buyer?.lastName,
    raw?.booking?.lastName,
  ];

  for (const candidate of candidates) {
    const lastName = normalize(candidate);

    if (lastName) {
      return lastName;
    }
  }

  return null;
}

function resolveMember(
  members: MemberRow[],
  ticketFirstName: string | null,
  ticketLastName: string | null
): MemberRow | null {
  if (members.length === 1) {
    return members[0];
  }

  if (!ticketFirstName || !ticketLastName) {
    return null;
  }

  const normalizedTicketFirstName = normalizeName(ticketFirstName);
  const normalizedTicketLastName = normalizeName(ticketLastName);

  const exactMatches = members.filter(
    (member) =>
      normalizeName(member.first_name) === normalizedTicketFirstName &&
      normalizeName(member.last_name) === normalizedTicketLastName
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  return null;
}

async function findLocalMembersByEmail(
  supabase: any,
  email: string
): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id,first_name,last_name,email,phone,status,membership_group,membership_expires_at"
    )
    .ilike("email", email);

  if (error) throw error;
  return (data || []) as MemberRow[];
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));

    const eventId = normalize(body?.event_id);
    const code = normalize(body?.code);
    const gateRole = normalizeDoorRole(body?.gate_role);

    if (!eventId || !code) {
      return jsonFast(
        false,
        "MISSING_INPUT",
        "Evento o codice QR mancante.",
        {
          ms: Date.now() - startedAt,
        }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    }

    const supabase = createClient(
      supabaseUrl,
      assertEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: ticket, error: ticketError } = await supabase
      .from("xceed_tickets")
      .select("id,status,raw,checkin_id")
      .eq("event_id", eventId)
      .eq("qr_code", code)
      .maybeSingle();

    if (ticketError) {
      console.error("FAST_CHECK_TICKET_ERROR", ticketError);

      return jsonFast(
        false,
        "DB_ERROR",
        "Errore durante il controllo del biglietto.",
        {
          ms: Date.now() - startedAt,
        }
      );
    }

    if (!ticket) {
      return jsonFast(
        false,
        "NO_TICKET",
        "Biglietto Xceed non trovato.",
        {
          ms: Date.now() - startedAt,
        }
      );
    }

    const raw: any = ticket.raw || {};
    const ticketStatus = normalize(ticket.status).toLowerCase();

    const offerType = normalize(
      raw?.offer?.type ||
        raw?.ticket?.offer?.type ||
        raw?.booking?.offer?.type
    ).toLowerCase();

    const ticketCancelled =
      ticketStatus.includes("cancel") ||
      ticketStatus.includes("refund") ||
      offerType === "cancelled";

    if (ticketCancelled) {
      return jsonFast(
        false,
        "NO_TICKET",
        "Biglietto Xceed annullato o non valido.",
        {
          ms: Date.now() - startedAt,
          ticket_status: ticketStatus || null,
          offer_type: offerType || null,
        }
      );
    }

    const hasCheckedIn =
      raw?.pass?.hasCheckedIn ??
      raw?.ticket?.hasCheckedIn ??
      raw?.booking?.passes?.[0]?.hasCheckedIn ??
      false;

    const isCheckedIn =
      ticketStatus === "checked_in" ||
      Boolean(ticket.checkin_id) ||
      hasCheckedIn === true;

    const ticketEmail = extractTicketEmail(raw);
    const ticketFirstName = extractTicketFirstName(raw);
    const ticketLastName = extractTicketLastName(raw);

    if (!ticketEmail) {
      return jsonFast(
        true,
        "MEMBER_NOT_FOUND",
        "Email tessera non disponibile: verificare il socio.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          ticket_status: ticketStatus || null,
        }
      );
    }

    let memberRows: MemberRow[] = [];
    let memberSource: MemberSource = "wallyfor_api";
    let wallyforFallbackReason: string | null = null;

    try {
      memberRows = await findWallyforMembersByEmail(ticketEmail);
    } catch (error) {
      memberSource = "supabase_fallback";
      wallyforFallbackReason =
        error instanceof WallyforApiError
          ? error.code || String(error.status)
          : "UNKNOWN_ERROR";
      console.error("FAST_CHECK_WALLYFOR_ERROR", error);
    }

    if (memberRows.length === 0) {
      memberSource = "supabase_fallback";

      try {
        memberRows = await findLocalMembersByEmail(supabase, ticketEmail);
      } catch (memberError) {
        console.error("FAST_CHECK_MEMBER_ERROR", memberError);

        return jsonFast(
          false,
          "DB_ERROR",
          "Errore durante il controllo della tessera.",
          {
            ms: Date.now() - startedAt,
            membership_source: memberSource,
            wallyfor_fallback_reason: wallyforFallbackReason,
          }
        );
      }
    }

    if (memberRows.length === 0) {
      return jsonFast(
        true,
        "MEMBER_NOT_FOUND",
        "Nessuna tessera associata: procedere al tesseramento.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          ticket_email: ticketEmail,
          ticket_first_name: ticketFirstName,
          ticket_last_name: ticketLastName,
          ticket_status: ticketStatus || null,
          membership_source: memberSource,
          wallyfor_fallback_reason: wallyforFallbackReason,
        }
      );
    }

    const member = resolveMember(
      memberRows,
      ticketFirstName,
      ticketLastName
    );

    if (!member) {
      return jsonFast(
        true,
        "MEMBERSHIP_REVIEW",
        "Più soci associati alla stessa email: verificare nome e tessera.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          ticket_email: ticketEmail,
          ticket_first_name: ticketFirstName,
          ticket_last_name: ticketLastName,
          matching_members: memberRows.length,
          ticket_status: ticketStatus || null,
          membership_source: memberSource,
          wallyfor_fallback_reason: wallyforFallbackReason,
        }
      );
    }

    const memberStatus = normalize(member.status).toUpperCase();
    const membershipExpiresAt = normalize(
      member.membership_expires_at
    );

    if (memberStatus === "NON ATTIVA") {
      return jsonFast(
        true,
        "MEMBERSHIP_INACTIVE",
        "La tessera risulta non attiva.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_first_name: member.first_name,
          member_last_name: member.last_name,
          member_email: member.email,
          member_phone: member.phone,
          member_status: memberStatus,
          membership_group: member.membership_group,
          membership_expires_at: membershipExpiresAt || null,
          membership_source: memberSource,
        }
      );
    }

    if (memberStatus === "REVOCATA") {
      return jsonFast(
        true,
        "MEMBERSHIP_INACTIVE",
        "La tessera risulta revocata.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_first_name: member.first_name,
          member_last_name: member.last_name,
          member_email: member.email,
          member_phone: member.phone,
          member_status: memberStatus,
          membership_group: member.membership_group,
          membership_expires_at: membershipExpiresAt || null,
          membership_source: memberSource,
        }
      );
    }

    if (
      memberStatus === "SCADUTA" ||
      (membershipExpiresAt &&
        membershipExpiresAt < todayIsoDate())
    ) {
      return jsonFast(
        true,
        "MEMBERSHIP_EXPIRED",
        "La tessera risulta scaduta.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_first_name: member.first_name,
          member_last_name: member.last_name,
          member_email: member.email,
          member_phone: member.phone,
          member_status: memberStatus,
          membership_group: member.membership_group,
          membership_expires_at: membershipExpiresAt || null,
          membership_source: memberSource,
        }
      );
    }

    if (memberStatus !== "ATTIVA" || !membershipExpiresAt) {
      return jsonFast(
        true,
        "MEMBERSHIP_REVIEW",
        "Verificare manualmente lo stato della tessera.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_first_name: member.first_name,
          member_last_name: member.last_name,
          member_status: memberStatus || null,
          membership_group: member.membership_group,
          membership_expires_at: membershipExpiresAt || null,
          membership_source: memberSource,
        }
      );
    }

    const memberRole = getMemberRole(member);
    const memberPayload = {
      id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      phone: member.phone,
      membership_group: member.membership_group,
      status: member.status,
      membership_expires_at: member.membership_expires_at,
    };

    if (!canUseGate(memberRole, gateRole)) {
      return jsonFast(
        true,
        "WRONG_GATE",
        `Gate non corretto: socio ${memberRole.toUpperCase()}, gate ${String(gateRole).toUpperCase()}.`,
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          ticket_status: ticketStatus || null,
          member_role: memberRole,
          gate_role: gateRole,
          member_email: member.email,
          member_phone: member.phone,
          member: memberPayload,
          membership_source: memberSource,
        }
      );
    }

    return jsonFast(
      true,
      "OK_ACCESS",
      "Tessera attiva e gate corretto.",
      {
        ms: Date.now() - startedAt,
        checked_in: isCheckedIn,
        ticket_status: ticketStatus || null,
        offer_type: offerType || null,
        member_role: memberRole,
        gate_role: gateRole,
        member_email: member.email,
        member_phone: member.phone,
        member: memberPayload,
        membership_source: memberSource,
      }
    );
  } catch (error) {
    console.error("FAST_CHECK_FATAL", error);

    return jsonFast(
      false,
      "FATAL_ERROR",
      "Errore interno Fast Check.",
      {
        ms: Date.now() - startedAt,
      }
    );
  }
}
