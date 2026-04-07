import { NextRequest, NextResponse } from "next/server";
import { evaluateDoorXceedLive } from "@/lib/door/xceed-live-evaluate-core";
import { readDeviceContextFromSearchParams } from "@/lib/door/device-context";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const deviceCtx = readDeviceContextFromSearchParams(searchParams);

    const payload = await evaluateDoorXceedLive({
      qrCode: body?.qrCode || body?.qr_code || body?.qr || "",
      xceedRaw: body?.xceedRaw || null,
      latestCheckedIn: body?.latestCheckedIn === true,
      eventId: body?.eventId || "",
      gateId: deviceCtx.gate_id || undefined,
      doorRole: deviceCtx.door_role || undefined,
      deviceLabel: deviceCtx.device_label || undefined,
    });

    const status = payload.ok ? 200 : payload.error ? 500 : 400;

    return NextResponse.json(payload, { status });
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