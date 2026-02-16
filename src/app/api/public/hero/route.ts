import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json({ ok: false, error: message, extra }, { status });
}

function asString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function firstNonEmpty(...vals: Array<string | undefined | null>): string {
  for (const x of vals) {
    const s = (x || "").trim();
    if (s) return s;
  }
  return "";
}

/** Airtable attachments: [{ id, url, filename, ... }] */
function pickAttachmentUrl(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    if (first && typeof first === "object" && typeof first.url === "string") return first.url.trim();
    if (typeof first === "string") return first.trim();
  }
  if (typeof v === "object" && typeof v.url === "string") return v.url.trim();
  return "";
}

/**
 * Converte link Google Drive "share" in link "diretto" (download/uc).
 * Serve per <img src> / poster / <video src> quando usi Drive.
 */
function normalizeMediaUrl(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";

  // Se già è un direct link "uc?export=..." lo lasciamo
  if (s.includes("drive.google.com/uc?") || s.includes("googleusercontent.com")) return s;

  // Pattern: https://drive.google.com/file/d/<ID>/view?usp=...
  let m = s.match(/drive\.google\.com\/file\/d\/([^/]+)\/view/i);
  if (m?.[1]) return `https://drive.google.com/uc?export=download&id=${m[1]}`;

  // Pattern: https://drive.google.com/open?id=<ID>
  m = s.match(/drive\.google\.com\/open\?id=([^&]+)/i);
  if (m?.[1]) return `https://drive.google.com/uc?export=download&id=${m[1]}`;

  // Pattern: https://drive.google.com/drive/folders/<ID>  (NON è un file singolo)
  // qui non possiamo trasformare in media diretto
  return s;
}

export async function GET() {
  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || "";
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
    const HERO_TABLE = process.env.AIRTABLE_TABLE_HERO || "HERO";

    if (!AIRTABLE_TOKEN) return jsonError("Missing AIRTABLE_TOKEN", 500);
    if (!AIRTABLE_BASE_ID) return jsonError("Missing AIRTABLE_BASE_ID", 500);

    const filterByFormula = "Active=TRUE()";
    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(HERO_TABLE)}` +
      `?maxRecords=1&filterByFormula=${encodeURIComponent(filterByFormula)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return jsonError(`Airtable HERO fetch failed (${res.status})`, 500, txt);
    }

    const data = await res.json();
    const rec = Array.isArray(data?.records) ? data.records[0] : null;
    const f = rec?.fields || {};

    const title = asString(f["Title"] ?? f["title"] ?? f["hero_title"] ?? f["HERO_TITLE"] ?? f["Hero Title"]);
    const subtitle = asString(f["Subtitle"] ?? f["subtitle"] ?? f["hero_subtitle"] ?? f["HERO_SUBTITLE"] ?? f["Hero Subtitle"]);
    const active = Boolean(f["Active"] ?? f["active"] ?? f["hero_active"] ?? f["HERO_ACTIVE"]);

    // -------- VIDEO (testo + attachment, con molti alias) --------
    const videoUrlText = asString(
      f["VideoUrl"] ??
        f["videoUrl"] ??
        f["Video URL"] ??
        f["video_url"] ??
        f["Hero Video Url"] ??
        f["Hero Video URL"] ??
        f["hero_video_url"] ??
        f["YouTube"] ??
        f["Youtube"] ??
        f["YT"] ??
        f["video"] ??
        f["Video"]
    );

    const videoUrlFromAttachment = pickAttachmentUrl(
      f["VideoFile"] ??
        f["Video File"] ??
        f["video_file"] ??
        f["Hero Video File"] ??
        f["hero_video_file"] ??
        f["Hero Video"] ??
        f["VideoAttachment"] ??
        f["Video Attachment"] ??
        f["video_attachment"]
    );

    const videoUrl = normalizeMediaUrl(firstNonEmpty(videoUrlText, videoUrlFromAttachment));

    // -------- IMAGE (testo + attachment, con alias incl. cover_file) --------
    const imageUrlText = asString(
      f["ImageUrl"] ??
        f["imageUrl"] ??
        f["Image URL"] ??
        f["image_url"] ??
        f["Hero Image Url"] ??
        f["Hero Image URL"] ??
        f["hero_image_url"] ??
        f["CoverUrl"] ??
        f["cover_url"] ??
        f["Cover URL"]
    );

    const imageUrlFromAttachment = pickAttachmentUrl(
      f["Image"] ??
        f["Hero Image"] ??
        f["HeroImage"] ??
        f["hero_image"] ??
        f["Cover"] ??
        f["Cover Image"] ??
        f["cover_file"] ??
        f["Cover File"] ??
        f["Hero Cover"] ??
        f["Hero Poster Image"]
    );

    const imageUrl = normalizeMediaUrl(firstNonEmpty(imageUrlText, imageUrlFromAttachment));

    // -------- POSTER (testo + attachment, con alias incl. poster_file) --------
    const posterUrlText = asString(
      f["PosterUrl"] ??
        f["posterUrl"] ??
        f["Poster URL"] ??
        f["poster_url"] ??
        f["Hero Poster Url"] ??
        f["Hero Poster URL"] ??
        f["hero_poster_url"]
    );

    const posterUrlFromAttachment = pickAttachmentUrl(
      f["Poster"] ??
        f["Hero Poster"] ??
        f["Poster Image"] ??
        f["poster_file"] ??
        f["PosterFile"] ??
        f["Poster File"] ??
        f["poster"] ??
        f["Hero Poster File"]
    );

    const posterUrl = normalizeMediaUrl(firstNonEmpty(posterUrlText, posterUrlFromAttachment));

    return NextResponse.json({
      ok: true,
      hero: { title, subtitle, active, videoUrl, imageUrl, posterUrl },
    });
  } catch (err: any) {
    return jsonError(err?.message || "Server error", 500);
  }
}
