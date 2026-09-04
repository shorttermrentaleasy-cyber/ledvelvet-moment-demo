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

async function requireAdminEmail() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return email && allowed.includes(email) ? email : null;
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

async function loadMemberOverrides(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string
) {
  const { data, error } = await supabase
    .from("ticket_anomalies")
    .select("ticket_ref,member_id")
    .eq("event_id", eventId)
    .eq("status", "resolved")
    .not("member_id", "is", null);
  if (error) throw error;
  return new Map(
    (data || [])
      .filter((item) => item.ticket_ref && item.member_id)
      .map((item) => [String(item.ticket_ref), String(item.member_id)])
  );
}

async function loadEventPrescreen(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string
) {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,name,starts_at,venue,city,xceed_event_ref,xceed_event_uuid")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error("Evento non trovato");

  const xceedEventId = String(
    event.xceed_event_uuid || event.xceed_event_ref || ""
  ).trim();
  if (!xceedEventId) throw new Error("Evento senza collegamento Xceed");

  const [tickets, bookings, members, memberOverrides] = await Promise.all([
    fetchXceedPages<PrescreenTicket>("tickets", xceedEventId),
    fetchXceedPages<PrescreenBooking>("bookings", xceedEventId),
    fetchAllMembers(supabase),
    loadMemberOverrides(supabase, eventId),
  ]);
  const rows = buildPrescreenRows({
    tickets,
    bookings,
    members,
    memberOverrides,
  });

  return {
    event,
    generated_at: new Date().toISOString(),
    summary: summarizePrescreen(rows),
    rows,
  };
}

export async function GET(request: Request) {
  if (!(await requireAdminEmail())) {
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

    const data = await loadEventPrescreen(supabase, eventId);

    return NextResponse.json(
      {
        ok: true,
        ...data,
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

export async function POST(request: Request) {
  const adminEmail = await requireAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const eventId = String(body?.event_id || "").trim();
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "event_id obbligatorio" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const current = await loadEventPrescreen(supabase, eventId);
    const rowByRef = new Map(current.rows.map((row) => [row.ticket_ref, row]));
    const { data: openAnomalies, error: anomalyError } = await supabase
      .from("ticket_anomalies")
      .select("id,ticket_ref,anomaly_type,status")
      .eq("event_id", eventId)
      .in("status", ["open", "in_progress", "waiting_participant"]);
    if (anomalyError) throw anomalyError;

    let resolvedCount = 0;
    let newMembershipCount = 0;
    let renewalCount = 0;
    const resolvedAt = new Date().toISOString();

    for (const anomaly of openAnomalies || []) {
      const row = rowByRef.get(String(anomaly.ticket_ref));
      if (!row || row.result !== "active" || !row.member?.id) continue;

      const type = String(anomaly.anomaly_type);
      if (type !== "non_member" && type !== "inactive_membership") continue;

      const isNewMembership = type === "non_member";
      const note = isNewMembership
        ? "Tessera Clubber Led Velvet attiva rilevata dopo la comunicazione. Anomalia risolta automaticamente."
        : "Rinnovo della Tessera Clubber Led Velvet rilevato dopo la comunicazione. Anomalia risolta automaticamente.";

      const { data: updated, error: updateError } = await supabase
        .from("ticket_anomalies")
        .update({
          status: "resolved",
          member_id: row.member.id,
          admin_note: note,
          resolved_at: resolvedAt,
          updated_at: resolvedAt,
        })
        .eq("id", anomaly.id)
        .eq("status", anomaly.status)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) continue;

      const { error: historyError } = await supabase
        .from("ticket_anomaly_history")
        .insert({
          anomaly_id: anomaly.id,
          status: "resolved",
          note,
          admin_email: adminEmail,
        });
      if (historyError) throw historyError;

      resolvedCount += 1;
      if (isNewMembership) newMembershipCount += 1;
      else renewalCount += 1;
    }

    return NextResponse.json(
      {
        ok: true,
        resolved_count: resolvedCount,
        new_memberships: newMembershipCount,
        renewals: renewalCount,
        ...current,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
