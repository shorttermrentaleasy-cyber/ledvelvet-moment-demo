import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) return { ok: false as const, code: 401 as const };

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) return { ok: false as const, code: 403 as const };
  return { ok: true as const };
}

function pickEvent(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  if (value && typeof value === "object") return value;
  return null;
}

function isCheckedInTicket(ticket: { status: string | null; raw: any }) {
  if ((ticket.status || "").trim().toLowerCase() === "checked_in") return true;

  return Boolean(
    ticket.raw?.pass?.hasCheckedIn ||
      ticket.raw?.ticket?.hasCheckedIn ||
      ticket.raw?.hasCheckedIn
  );
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: admin.code });
    }

    const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
    if (!barcode) {
      return NextResponse.json({ ok: false, error: "barcode_required" }, { status: 400 });
    }

    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("legacy_barcode", barcode)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const { data, error } = await supabase
      .from("checkins")
      .select(`
        id,
        event_id,
        checkin_at,
        created_at,
        result,
        reason,
        method,
        kind,
        events (
          name,
          city,
          venue,
          starts_at
        )
      `)
      .eq("member_id", member.id)
      .order("checkin_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const ticketUsageByCheckinId = new Map<string, number>();
    const memberEmail = String(member.email || "").trim();
    const memberName = normalizeIdentity(
      `${String(member.first_name || "").trim()} ${String(member.last_name || "").trim()}`
    );
    const accessEventIds = Array.from(
      new Set(
        (data || [])
          .map((row: any) => String(row.event_id || "").trim())
          .filter(Boolean)
      )
    );

    if (memberEmail && memberName && accessEventIds.length > 0) {
      const { data: memberTicketData, error: memberTicketError } = await supabase
        .from("xceed_tickets")
        .select("event_id, transaction_id, full_name")
        .in("event_id", accessEventIds)
        .ilike("email", memberEmail);

      if (memberTicketError) throw memberTicketError;

      const transactionsByEvent = new Map<string, Set<string>>();

      for (const ticket of memberTicketData || []) {
        const eventId = String(ticket.event_id || "").trim();
        const transactionId = String(ticket.transaction_id || "").trim();
        if (
          !eventId ||
          !transactionId ||
          normalizeIdentity(ticket.full_name) !== memberName
        ) {
          continue;
        }

        const transactions = transactionsByEvent.get(eventId) || new Set<string>();
        transactions.add(transactionId);
        transactionsByEvent.set(eventId, transactions);
      }

      await Promise.all(
        Array.from(transactionsByEvent.entries()).map(async ([eventId, transactions]) => {
          // Se nello stesso evento il socio compare in più prenotazioni, non attribuiamo
          // automaticamente i biglietti aggiuntivi a uno specifico ingresso.
          if (transactions.size !== 1) return;
          const transactionId = Array.from(transactions)[0];

          const { data: bookingTickets, error: bookingTicketsError } = await supabase
            .from("xceed_tickets")
            .select("status, raw")
            .eq("event_id", eventId)
            .eq("transaction_id", transactionId);

          if (bookingTicketsError) throw bookingTicketsError;

          const usedTickets = (bookingTickets || []).filter(isCheckedInTicket).length;
          if (usedTickets < 1) return;

          for (const access of data || []) {
            if (String(access.event_id || "").trim() === eventId) {
              ticketUsageByCheckinId.set(String(access.id), usedTickets);
            }
          }
        })
      );
    }

    const rows = (data || []).map((row: any) => ({
      id: row.id,
      checkin_at: row.checkin_at,
      created_at: row.created_at,
      result: row.result,
      reason: row.reason,
      method: row.method,
      kind: row.kind,
      event: pickEvent(row.events),
      used_tickets: ticketUsageByCheckinId.get(row.id) || 0,
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "server_error" },
      { status: 500 }
    );
  }
}
