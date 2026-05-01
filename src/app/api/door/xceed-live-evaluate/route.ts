import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateDoorXceedLive } from "@/lib/door/xceed-live-evaluate-core";
import { readDeviceContextFromSearchParams } from "@/lib/door/device-context";
import { resolveDoorGateByXceedEmail } from "@/lib/door/resolve-door-gate";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

function extractCheckedInBy(body: any): string | null {
  return (
    body?.checkedInBy ||
    body?.checked_in_by ||
    body?.xceedRaw?.checkedInBy ||
    body?.xceedRaw?.checked_in_by ||
    body?.xceedRaw?.raw?.checkedInBy ||
    body?.xceedRaw?.raw?.checked_in_by ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const deviceCtx = readDeviceContextFromSearchParams(searchParams);

    const checkedInBy = extractCheckedInBy(body);
    const resolvedGate = await resolveDoorGateByXceedEmail(
      supabase,
      checkedInBy
    );

    const gateMappingWarning =
      checkedInBy && resolvedGate.source === "not_found"
        ? `Email Xceed non configurata nei Door Gates: ${checkedInBy}`
        : null;

    const finalGateId =
      resolvedGate.gate_id || deviceCtx.gate_id || undefined;

    const finalDoorRole =
      resolvedGate.door_role || deviceCtx.door_role || undefined;

    const finalDeviceLabel =
      resolvedGate.gate_name ||
      deviceCtx.device_label ||
      undefined;

    const payload = await evaluateDoorXceedLive({
      qrCode: body?.qrCode || body?.qr_code || body?.qr || "",
      xceedRaw: body?.xceedRaw || null,
      latestCheckedIn: body?.latestCheckedIn === true,
      eventId: body?.eventId || "",
      gateId: finalGateId,
      doorRole: finalDoorRole,
      deviceLabel: finalDeviceLabel,
    });

    const status = payload.ok ? 200 : payload.error ? 500 : 400;

// 🔥 LOG EMAIL NON MAPPATE
if (
  checkedInBy &&
  resolvedGate.source === "not_found"
) {
  try {
    const { data: existing } = await supabase
      .from("door_unmapped_xceed_emails")
      .select("*")
      .eq("xceed_email", checkedInBy)
      .eq("event_id", body?.eventId || null)
      .maybeSingle();

    if (!existing) {
      await supabase.from("door_unmapped_xceed_emails").insert({
        xceed_email: checkedInBy,
        event_id: body?.eventId || null,
        last_qr_code: body?.qrCode || null,
        last_payload: body || null,
        scan_count: 1,
      });
    } else {
      await supabase
        .from("door_unmapped_xceed_emails")
        .update({
          scan_count: (existing.scan_count || 0) + 1,
          last_seen_at: new Date().toISOString(),
          last_qr_code: body?.qrCode || null,
          last_payload: body || null,
        })
        .eq("id", existing.id);
    }
  } catch (e) {
    console.error("UNMAPPED EMAIL LOG ERROR", e);
  }
}

    return NextResponse.json(
      {
        ...payload,
        debug: {
          ...(payload as any)?.debug,
          checkedInBy,
          gate_mapping_source: resolvedGate.source,
          resolved_gate_id: resolvedGate.gate_id,
          resolved_gate_name: resolvedGate.gate_name,
          resolved_door_role: resolvedGate.door_role,
          gate_mapping_warning: gateMappingWarning,
          fallback_gate_id: resolvedGate.gate_id ? null : deviceCtx.gate_id || null,
          fallback_door_role: resolvedGate.door_role
            ? null
            : deviceCtx.door_role || null,
        },
      },
      { status }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        result: "ERROR",
        title: "ERRORE",
        message: "Errore interno",
        error: message,
        member: null,
        ticket: null,
        event: null,
        live_key: null,
        booking: null,
      },
      { status: 500 }
    );
  }
}