import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AirtableAttachment = { url?: string };

function firstAttachmentUrl(v: any): string {
  if (!Array.isArray(v) || v.length === 0) return "";
  const a = v[0] as AirtableAttachment;
  return a?.url ? String(a.url) : "";
}

export async function GET() {
  try {
    const apiKey = (process.env.AIRTABLE_TOKEN || "").trim();
    const baseId = (process.env.AIRTABLE_BASE_ID || "").trim();

    if (!apiKey || !baseId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_airtable_env",
          need: ["AIRTABLE_TOKEN", "AIRTABLE_BASE_ID"],
          have: {
            AIRTABLE_TOKEN: apiKey ? "set" : "missing",
            AIRTABLE_BASE_ID: baseId ? "set" : "missing",
          },
        },
        { status: 500 }
      );
    }

    const tableName = "PLAYLIST_TRACKS";
    const viewName = "ACTIVE_HERO";

    const fields = ["title", "artist", "audio_file", "audio_url_override", "cover_file", "sort"];

    const qs = new URLSearchParams();
    qs.set("view", viewName);
    qs.set("pageSize", "50");
    fields.forEach((f) => qs.append("fields[]", f));
    qs.append("sort[0][field]", "sort");
    qs.append("sort[0][direction]", "asc");

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${qs.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });

    const text = await res.text();

    // Airtable deve rispondere JSON; se no, ti do preview
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "airtable_non_json",
          status: res.status,
          tableName,
          viewName,
          preview: (text || "").slice(0, 220).replace(/\s+/g, " ").trim(),
        },
        { status: 502 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "airtable_error",
          status: res.status,
          tableName,
          viewName,
          details: data,
        },
        { status: 502 }
      );
    }

    const records = Array.isArray(data?.records) ? data.records : [];

    const tracks = records
      .map((r: any) => {
        const f = r?.fields || {};
        const title = String(f.title || "").trim();
        const artist = String(f.artist || "").trim();
        const sort = typeof f.sort === "number" ? f.sort : parseInt(String(f.sort || "0"), 10) || 0;

        const audioOverride = String(f.audio_url_override || "").trim();
        const audioFromAttachment = firstAttachmentUrl(f.audio_file);
        const audio_url = audioOverride || audioFromAttachment || "";

        const cover_url = firstAttachmentUrl(f.cover_file) || "";

        return { id: String(r?.id || ""), title, artist, sort, audio_url, cover_url };
      })
      .filter((t: any) => t.title && t.audio_url);

    return NextResponse.json({ ok: true, tracks }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
