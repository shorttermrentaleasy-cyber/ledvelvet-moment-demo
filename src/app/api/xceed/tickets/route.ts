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
  const eventId = searchParams.get("eventId");
  const offset = searchParams.get("offset") || "0";
  const limit = searchParams.get("limit") || "20";
  const includeCancelledTickets =
    searchParams.get("includeCancelledTickets") || "true";

  if (!eventId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required query param: eventId",
      },
      { status: 400 }
    );
  }

  const url =
    `${baseUrl}/v1/tickets` +
    `?offset=${encodeURIComponent(offset)}` +
    `&limit=${encodeURIComponent(limit)}` +
    `&events=${encodeURIComponent(eventId)}` +
    `&includeCancelledTickets=${encodeURIComponent(includeCancelledTickets)}`;

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

    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(
      {
        ok: response.ok,
        xceedStatus: response.status,
        url,
        data,
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