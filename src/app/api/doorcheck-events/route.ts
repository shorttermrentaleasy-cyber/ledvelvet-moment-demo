import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Legacy DoorCheck events endpoint disabled" },
    { status: 410 }
  );
}
