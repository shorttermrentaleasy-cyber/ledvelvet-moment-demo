import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Legacy Door event summary endpoint disabled" },
    { status: 410 }
  );
}
