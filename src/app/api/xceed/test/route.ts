import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const apiKey = process.env.XCEED_API_KEY;
  const baseUrl = process.env.XCEED_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing XCEED_API_KEY or XCEED_BASE_URL in environment variables",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") || "100";
  const offset = searchParams.get("offset") || "0";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const url = `${baseUrl}/v1/events?offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    const rawEvents = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];

    const simplified = rawEvents.map((ev: any) => ({
      id: ev?.id ?? null,
      uuid: ev?.uuid ?? null,
      name: ev?.name ?? ev?.title ?? null,
      slug: ev?.slug ?? null,
      starts_at: ev?.startsAt ?? ev?.startAt ?? ev?.date ?? null,
      city: ev?.city ?? ev?.location?.city ?? null,
      raw: ev,
    }));

    const filtered = q
      ? simplified.filter((ev: any) =>
          JSON.stringify(ev).toLowerCase().includes(q)
        )
      : simplified;

    return NextResponse.json(
      {
        ok: response.ok,
        xceedStatus: response.status,
        url,
        count: filtered.length,
        events: filtered,
      },
      { status: response.ok ? 200 : response.status }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}