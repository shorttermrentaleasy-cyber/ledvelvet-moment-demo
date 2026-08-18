import { NextRequest, NextResponse } from "next/server";
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

function normalize(value: unknown): string {
  return String(value || "").trim();
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!allowed.includes(email)) {
    return NextResponse.json({ ok: false, error: "AccessDenied" }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const body = await req.json().catch(() => ({}));
    const eventId = normalize(body?.event_id);
    const gateId = normalize(body?.gate_id);

    if (!eventId || !gateId) {
      return NextResponse.json(
        { ok: false, error: "Seleziona un evento e un gate." },
        { status: 400 }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || assertEnv("SUPABASE_URL");
    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        assertEnv("SUPABASE_SERVICE_ROLE"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const [{ data: event, error: eventError }, { data: gate, error: gateError }] =
      await Promise.all([
        supabase
          .from("events")
          .select("id,name,starts_at")
          .eq("id", eventId)
          .maybeSingle(),
        supabase
          .from("door_gates")
          .select("gate_id,name,door_role,xceed_email,active")
          .eq("gate_id", gateId)
          .maybeSingle(),
      ]);

    if (eventError) throw eventError;
    if (gateError) throw gateError;

    if (!event) {
      return NextResponse.json(
        { ok: false, error: "Evento non trovato." },
        { status: 404 }
      );
    }

    if (!gate) {
      return NextResponse.json(
        { ok: false, error: "Gate non trovato." },
        { status: 404 }
      );
    }

    if (!gate.active) {
      return NextResponse.json(
        { ok: false, error: "Il gate è disattivato." },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("event_gate_overrides")
      .select("gate_id,door_role,scanner_email")
      .eq("event_id", eventId)
      .eq("gate_id", gateId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    let snapshot = existing;
    let snapshotCreated = false;

    if (!snapshot) {
      const { data: inserted, error: insertError } = await supabase
        .from("event_gate_overrides")
        .insert({
          event_id: eventId,
          gate_id: gate.gate_id,
          door_role: gate.door_role,
          scanner_email: String(gate.xceed_email || "").trim().toLowerCase(),
        })
        .select("gate_id,door_role,scanner_email")
        .single();

      if (insertError) throw insertError;
      snapshot = inserted;
      snapshotCreated = true;
    }

    const fastCheckUrl = new URL("/door/fast", req.nextUrl.origin);
    fastCheckUrl.searchParams.set("event_id", eventId);
    fastCheckUrl.searchParams.set("gate_id", gateId);

    return NextResponse.json({
      ok: true,
      link: fastCheckUrl.toString(),
      snapshot_created: snapshotCreated,
      event: {
        id: event.id,
        name: event.name,
        starts_at: event.starts_at,
      },
      gate: {
        gate_id: gate.gate_id,
        name: gate.name,
        door_role: snapshot?.door_role || gate.door_role,
        xceed_email: snapshot?.scanner_email || gate.xceed_email,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Errore nella creazione del link Fast Check.",
      },
      { status: 500 }
    );
  }
}
