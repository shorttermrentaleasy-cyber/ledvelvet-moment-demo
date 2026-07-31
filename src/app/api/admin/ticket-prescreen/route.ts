import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import {
  buildPrescreenRows,
  PrescreenBooking,
  PrescreenMember,
  PrescreenTicket,
  summarizePrescreen,
} from "@/lib/ticket-prescreen";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 100;
const MAX_XCEED_PAGES = 50;
const MEMBER_PAGE_SIZE = 1000;

function env(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email));
}

function supabaseAdmin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchXceedPages<T>(path: "tickets" | "bookings", eventId: string) {
  const rows: T[] = [];
  const baseUrl = env("XCEED_BASE_URL");
  const apiKey = env("XCEED_API_KEY");

  for (let page = 0; page < MAX_XCEED_PAGES; page += 1) {
    const url = new URL(`/v1/${path}`, baseUrl);
    url.searchParams.set("offset", String(page * PAGE_SIZE));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("events", eventId);
    url.searchParams.set("includeCancelledTickets", "true");

    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(`Xceed ${path} request failed (${response.status})`);
    }

    rows.push(...(payload.data as T[]));
    if (payload.data.length < PAGE_SIZE) return rows;
  }

  throw new Error(`Xceed ${path} pagination exceeded the safety limit`);
}

async function fetchAllMembers(supabase: ReturnType<typeof supabaseAdmin>) {
  const members: PrescreenMember[] = [];
  const fields =
    "id,barcode,first_name,last_name,full_name,email,phone,membership_group,status,membership_expires_at,is_present";

  for (let from = 0; ; from += MEMBER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("wallyfor_members")
      .select(fields)
      .range(from, from + MEMBER_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as PrescreenMember[];
    members.push(...page);
    if (page.length < MEMBER_PAGE_SIZE) return members;
  }
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 403 }
    );
  }

  try {
    const supabase = supabaseAdmin();
    const eventId = new URL(request.url).searchParams.get("event_id")?.trim();

    if (!eventId) {
      const { data, error } = await supabase
        .from("events")
        .select("id,name,starts_at,venue,city,xceed_event_ref,xceed_event_uuid")
        .order("starts_at", { ascending: false });
      if (error) throw error;

      const events = (data || []).filter(
        (event) => event.xceed_event_uuid || event.xceed_event_ref
      );
      return NextResponse.json(
        { ok: true, events },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,name,starts_at,venue,city,xceed_event_ref,xceed_event_uuid")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) {
      return NextResponse.json(
        { ok: false, error: "Evento non trovato" },
        { status: 404 }
      );
    }

    const xceedEventId = String(
      event.xceed_event_uuid || event.xceed_event_ref || ""
    ).trim();
    if (!xceedEventId) {
      return NextResponse.json(
        { ok: false, error: "Evento senza collegamento Xceed" },
        { status: 400 }
      );
    }

    const [tickets, bookings, members] = await Promise.all([
      fetchXceedPages<PrescreenTicket>("tickets", xceedEventId),
      fetchXceedPages<PrescreenBooking>("bookings", xceedEventId),
      fetchAllMembers(supabase),
    ]);
    const rows = buildPrescreenRows({ tickets, bookings, members });

    return NextResponse.json(
      {
        ok: true,
        event,
        generated_at: new Date().toISOString(),
        summary: summarizePrescreen(rows),
        rows,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "server_error",
      },
      { status: 500 }
    );
  }
}
