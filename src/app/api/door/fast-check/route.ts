import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FastDecision =
  | "OK_ACCESS"
  | "NO_TICKET"
  | "MEMBER_NOT_FOUND"
  | "MEMBERSHIP_INACTIVE"
  | "MEMBERSHIP_EXPIRED"
  | "MEMBERSHIP_REVIEW"
  | "MISSING_INPUT"
  | "DB_ERROR"
  | "FATAL_ERROR";

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

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));

    const eventId = normalize(body?.event_id);
    const code = normalize(body?.code);

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

    const supabase = createClient(
      assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
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

    if (!ticketEmail) {
      return jsonFast(
        true,
        "MEMBER_NOT_FOUND",
        "Biglietto valido, ma email socio non disponibile.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          ticket_status: ticketStatus || null,
        }
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select(
        "id,first_name,last_name,email,status,membership_group,membership_expires_at"
      )
      .ilike("email", ticketEmail)
      .limit(1)
      .maybeSingle();

    if (memberError) {
      console.error("FAST_CHECK_MEMBER_ERROR", memberError);

      return jsonFast(
        false,
        "DB_ERROR",
        "Errore durante il controllo della tessera.",
        {
          ms: Date.now() - startedAt,
        }
      );
    }

    if (!member) {
      return jsonFast(
        true,
        "MEMBER_NOT_FOUND",
        "Biglietto valido. Tessera socio da fare.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          ticket_email: ticketEmail,
          ticket_status: ticketStatus || null,
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
        "Biglietto valido. Tessera non attiva.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_status: memberStatus,
          membership_expires_at: membershipExpiresAt || null,
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
        "Biglietto valido. Tessera scaduta.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_status: memberStatus,
          membership_expires_at: membershipExpiresAt || null,
        }
      );
    }

    if (
      memberStatus !== "ATTIVA" ||
      !membershipExpiresAt
    ) {
      return jsonFast(
        true,
        "MEMBERSHIP_REVIEW",
        "Biglietto valido. Verificare la tessera.",
        {
          ms: Date.now() - startedAt,
          checked_in: isCheckedIn,
          member_id: member.id,
          member_status: memberStatus || null,
          membership_expires_at: membershipExpiresAt || null,
        }
      );
    }

    return jsonFast(
      true,
      "OK_ACCESS",
      "Biglietto e tessera validi.",
      {
        ms: Date.now() - startedAt,
        checked_in: isCheckedIn,
        ticket_status: ticketStatus || null,
        offer_type: offerType || null,
        member: {
          id: member.id,
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
          membership_group: member.membership_group,
          status: member.status,
          membership_expires_at: member.membership_expires_at,
        },
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