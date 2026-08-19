import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Endpoint retired" },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
