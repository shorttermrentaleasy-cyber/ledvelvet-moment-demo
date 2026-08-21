import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Legacy hero video endpoint disabled" },
    { status: 410 }
  );
}
