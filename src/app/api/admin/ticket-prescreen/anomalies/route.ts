import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANOMALY_TYPES = [
  "inactive_membership",
  "non_member",
  "possible_duplicate",
  "identity_review",
] as const;

const ANOMALY_STATUSES = [
  "open",
  "in_progress",
  "waiting_participant",
  "resolved",
  "archived",
] as const;

type AnomalyType = (typeof ANOMALY_TYPES)[number];
type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];

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

async function readHistory(
  supabase: ReturnType<typeof supabaseAdmin>,
  anomalyIds: string[]
) {
  if (!anomalyIds.length) return new Map<string, unknown[]>();

  const { data, error } = await supabase
    .from("ticket_anomaly_history")
    .select("id,anomaly_id,status,note,admin_email,created_at")
    .in("anomaly_id", anomalyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const grouped = new Map<string, unknown[]>();
  for (const item of data || []) {
    const anomalyId = String(item.anomaly_id);
    grouped.set(anomalyId, [...(grouped.get(anomalyId) || []), item]);
  }
  return grouped;
}

export async function GET(request: Request) {
  const adminEmail = await requireAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  try {
    const eventId = new URL(request.url).searchParams.get("event_id")?.trim();
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "event_id obbligatorio" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("ticket_anomalies")
      .select(
        "id,event_id,ticket_ref,anomaly_type,status,member_id,admin_note,assigned_admin_email,resolved_at,created_at,updated_at"
      )
      .eq("event_id", eventId)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const anomalies = data || [];
    const history = await readHistory(
      supabase,
      anomalies.map((item) => String(item.id))
    );

    return NextResponse.json(
      {
        ok: true,
        anomalies: anomalies.map((item) => ({
          ...item,
          history: history.get(String(item.id)) || [],
        })),
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

export async function PUT(request: Request) {
  const adminEmail = await requireAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const eventId = String(body?.event_id || "").trim();
    const ticketRef = String(body?.ticket_ref || "").trim();
    const anomalyType = String(body?.anomaly_type || "") as AnomalyType;
    const status = String(body?.status || "") as AnomalyStatus;
    const memberId = body?.member_id ? String(body.member_id).trim() : null;
    const note = String(body?.note || "").trim();

    if (!eventId || !ticketRef) {
      return NextResponse.json(
        { ok: false, error: "Evento e biglietto sono obbligatori" },
        { status: 400 }
      );
    }
    if (!ANOMALY_TYPES.includes(anomalyType)) {
      return NextResponse.json(
        { ok: false, error: "Tipo anomalia non valido" },
        { status: 400 }
      );
    }
    if (!ANOMALY_STATUSES.includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Stato anomalia non valido" },
        { status: 400 }
      );
    }
    if (ticketRef.length > 255 || note.length > 2000) {
      return NextResponse.json(
        { ok: false, error: "Dati troppo lunghi" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const now = new Date().toISOString();
    const { data: anomaly, error } = await supabase
      .from("ticket_anomalies")
      .upsert(
        {
          event_id: eventId,
          ticket_ref: ticketRef,
          anomaly_type: anomalyType,
          status,
          member_id: memberId,
          admin_note: note || null,
          assigned_admin_email: adminEmail,
          resolved_at: status === "resolved" || status === "archived" ? now : null,
          updated_at: now,
        },
        { onConflict: "event_id,ticket_ref" }
      )
      .select(
        "id,event_id,ticket_ref,anomaly_type,status,member_id,admin_note,assigned_admin_email,resolved_at,created_at,updated_at"
      )
      .single();
    if (error) throw error;

    const { error: historyError } = await supabase
      .from("ticket_anomaly_history")
      .insert({
        anomaly_id: anomaly.id,
        status,
        note: note || null,
        admin_email: adminEmail,
      });
    if (historyError) throw historyError;

    const history = await readHistory(supabase, [String(anomaly.id)]);
    return NextResponse.json({
      ok: true,
      anomaly: {
        ...anomaly,
        history: history.get(String(anomaly.id)) || [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
