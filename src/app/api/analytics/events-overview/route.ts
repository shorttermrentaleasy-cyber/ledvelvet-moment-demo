import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!allowed.includes(email)) {
    return NextResponse.json(
      { ok: false, error: "AccessDenied" },
      { status: 403 }
    );
  }

  return null;
}

export async function GET() {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY || assertEnv("SUPABASE_SERVICE_ROLE");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, name, starts_at, venue, city")
      .order("starts_at", { ascending: false });

    if (eventsError) throw eventsError;

    const counts = new Map<
      string,
      { total: number; checked_in: number; active: number; cancelled: number; other: number }
    >();

    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data: tickets, error: ticketsError } = await supabase
        .from("xceed_tickets")
        .select("event_id, status")
        .range(from, from + pageSize - 1);

      if (ticketsError) throw ticketsError;

      for (const ticket of tickets || []) {
        if (!ticket.event_id) continue;

        const current = counts.get(ticket.event_id) || {
          total: 0,
          checked_in: 0,
          active: 0,
          cancelled: 0,
          other: 0,
        };
        const status = String(ticket.status || "").trim().toLowerCase();

        current.total += 1;
        if (status === "checked_in") current.checked_in += 1;
        else if (status === "active") current.active += 1;
        else if (status === "cancelled") current.cancelled += 1;
        else current.other += 1;

        counts.set(ticket.event_id, current);
      }

      if (!tickets || tickets.length < pageSize) break;
      from += pageSize;
    }

    return NextResponse.json({
      ok: true,
      events: (events || []).map((event) => {
        const eventCounts = counts.get(event.id) || {
          total: 0,
          checked_in: 0,
          active: 0,
          cancelled: 0,
          other: 0,
        };
        const validTickets = eventCounts.checked_in + eventCounts.active;

        return {
          ...event,
          ...eventCounts,
          valid_tickets: validTickets,
          conversion_rate:
            validTickets > 0 ? eventCounts.checked_in / validTickets : 0,
        };
      }),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
