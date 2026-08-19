import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKey = (req.headers.get("x-api-key") || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing API key" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const bodyText = await req.text();
    const url = new URL("/api/doorcheck", req.url);

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
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
