import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Endpoint retired" },
    { status: 410 }
  );
}
