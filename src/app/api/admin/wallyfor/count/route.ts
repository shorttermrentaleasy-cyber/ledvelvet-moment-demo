import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Legacy Wallyfor count endpoint disabled" },
    { status: 410 }
  );
}
