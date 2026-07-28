import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

const TABLE = "PLAYLIST_TRACKS";
const ACTIVE_NAMES = ["active", "attiva", "attivo", "is_active", "hero_active"];

function envOrThrow(key: string) {
  const value = String(process.env[key] || "").trim();
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

function isAdmin(email?: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(normalized && allowed.includes(normalized));
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return isAdmin(session?.user?.email);
}

async function airtable(path: string, init?: RequestInit) {
  const response = await fetch(
    `https://api.airtable.com/v0/${envOrThrow("AIRTABLE_BASE_ID")}/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${envOrThrow("AIRTABLE_TOKEN")}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    }
  );
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Airtable error (${response.status})`);
  }
  return json;
}

async function playlistSchema() {
  const response = await fetch(
    `https://api.airtable.com/v0/meta/bases/${envOrThrow("AIRTABLE_BASE_ID")}/tables`,
    {
      headers: { Authorization: `Bearer ${envOrThrow("AIRTABLE_TOKEN")}` },
      cache: "no-store",
    }
  );
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Lettura struttura Playlist fallita");
  const table = (json?.tables || []).find((item: any) => item?.name === TABLE);
  const fields = Array.isArray(table?.fields) ? table.fields : [];
  const activeField = fields.find((field: any) =>
    ACTIVE_NAMES.includes(String(field?.name || "").trim().toLowerCase())
  );
  return { activeField: activeField?.name ? String(activeField.name) : "" };
}

function attachment(value: any) {
  if (!Array.isArray(value) || !value[0]?.url) return null;
  return {
    id: String(value[0].id || ""),
    url: String(value[0].url),
    filename: String(value[0].filename || ""),
  };
}

function mapRecord(record: any, activeField: string) {
  const fields = record?.fields || {};
  return {
    id: String(record?.id || ""),
    title: String(fields.title || ""),
    artist: String(fields.artist || ""),
    sort: typeof fields.sort === "number" ? fields.sort : Number(fields.sort || 0),
    active: activeField ? Boolean(fields[activeField]) : true,
    audio: attachment(fields.audio_file),
    cover: attachment(fields.cover_file),
    audio_url_override: String(fields.audio_url_override || ""),
  };
}

function writableFields(input: any, activeField: string) {
  const fields: Record<string, any> = {
    title: String(input?.title || "").trim(),
    artist: String(input?.artist || "").trim(),
    sort: Number.isFinite(Number(input?.sort)) ? Number(input.sort) : 0,
    audio_url_override: String(input?.audio_url_override || "").trim(),
  };
  if (activeField) fields[activeField] = Boolean(input?.active);
  if (input?.audio_url !== undefined) {
    fields.audio_file = input.audio_attachment_id
      ? [{ id: String(input.audio_attachment_id) }]
      : input.audio_url
        ? [{ url: String(input.audio_url) }]
        : [];
  }
  if (input?.cover_url !== undefined) {
    fields.cover_file = input.cover_attachment_id
      ? [{ id: String(input.cover_attachment_id) }]
      : input.cover_url
        ? [{ url: String(input.cover_url) }]
        : [];
  }
  return fields;
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }
    const { activeField } = await playlistSchema();
    const query = new URLSearchParams({ pageSize: "100" });
    query.append("sort[0][field]", "sort");
    query.append("sort[0][direction]", "asc");
    const data = await airtable(`${encodeURIComponent(TABLE)}?${query.toString()}`);
    return NextResponse.json({
      ok: true,
      activeField,
      tracks: (data?.records || []).map((record: any) => mapRecord(record, activeField)),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Errore Playlist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }
    const input = await req.json();
    if (!String(input?.title || "").trim()) {
      return NextResponse.json({ ok: false, error: "Titolo obbligatorio" }, { status: 400 });
    }
    if (!String(input?.audio_url || input?.audio_url_override || "").trim()) {
      return NextResponse.json({ ok: false, error: "Carica un file MP3" }, { status: 400 });
    }
    const { activeField } = await playlistSchema();
    const created = await airtable(encodeURIComponent(TABLE), {
      method: "POST",
      body: JSON.stringify({ fields: writableFields(input, activeField), typecast: true }),
    });
    return NextResponse.json({ ok: true, track: mapRecord(created, activeField) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Creazione fallita" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }
    const input = await req.json();
    const id = String(input?.id || "").trim();
    if (!/^rec[a-zA-Z0-9]+$/.test(id)) {
      return NextResponse.json({ ok: false, error: "Traccia non valida" }, { status: 400 });
    }
    if (!String(input?.title || "").trim()) {
      return NextResponse.json({ ok: false, error: "Titolo obbligatorio" }, { status: 400 });
    }
    const { activeField } = await playlistSchema();
    const updated = await airtable(`${encodeURIComponent(TABLE)}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: writableFields(input, activeField), typecast: true }),
    });
    return NextResponse.json({ ok: true, track: mapRecord(updated, activeField) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Salvataggio fallito" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }
    const id = String(new URL(req.url).searchParams.get("id") || "").trim();
    if (!/^rec[a-zA-Z0-9]+$/.test(id)) {
      return NextResponse.json({ ok: false, error: "Traccia non valida" }, { status: 400 });
    }
    await airtable(`${encodeURIComponent(TABLE)}/${id}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Eliminazione fallita" }, { status: 500 });
  }
}
