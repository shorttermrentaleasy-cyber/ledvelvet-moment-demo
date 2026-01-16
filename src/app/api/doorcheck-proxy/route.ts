import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const expected = (process.env.DOOR_API_KEY || "").trim();
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: DOOR_API_KEY missing" },
        { status: 500 }
      );
    }

    const bodyText = await req.text();

    // Costruisce l'origin in modo robusto (dev + prod)
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!host) {
      return NextResponse.json(
        { ok: false, error: "Missing host header" },
        { status: 500 }
      );
    }

    const url = `${proto}://${host}/api/doorcheck`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": expected, // SERVER-SIDE ONLY
      },
      body: bodyText,
      cache: "no-store",
    });

    const text = await upstream.text();

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
