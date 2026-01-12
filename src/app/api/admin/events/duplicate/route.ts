import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

type MetaField = {
  name: string;
  type: string;
};

function isWritableFieldType(t: string) {
  // Airtable “computed/readonly” types (non scrivibili)
  const blocked = new Set([
    "autoNumber",
    "barcode",
    "button",
    "count",
    "createdBy",
    "createdTime",
    "currency", // scrivibile, ma non blocchiamo in generale
    "date", // scrivibile
    "dateTime", // scrivibile
    "email", // scrivibile
    "externalSyncSource",
    "formula",
    "lastModifiedBy",
    "lastModifiedTime",
    "lookup",
    "multipleLookupValues",
    "rollup",
  ]);

  // Nota: alcuni sopra sarebbero scrivibili (date, email ecc).
  // Quindi blocchiamo solo i VERI computed/readonly:
  const reallyBlocked = new Set([
    "autoNumber",
    "barcode",
    "button",
    "count",
    "createdBy",
    "createdTime",
    "externalSyncSource",
    "formula",
    "lastModifiedBy",
    "lastModifiedTime",
    "lookup",
    "multipleLookupValues",
    "rollup",
  ]);

  return !reallyBlocked.has(t);
}

function isAttachmentType(t: string) {
  return t === "multipleAttachments";
}

/**
 * Airtable CREATE/PATCH accetta attachments SOLO come:
 * [{ url: "https://..." }, ...]
 * NON accetta oggetti completi con id/thumbnails/size ecc.
 */
function sanitizeAttachmentValue(v: any) {
  if (!v) return v;

  // multipleAttachments: array
  if (Array.isArray(v)) {
    const out = v
      .map((x) => {
        if (!x) return null;

        // se è già {url}
        if (typeof x === "object" && typeof x.url === "string") {
          return { url: x.url };
        }

        // se per qualche motivo fosse stringa
        if (typeof x === "string") return { url: x };

        return null;
      })
      .filter(Boolean);

    return out;
  }

  // se fosse un singolo oggetto (non standard), proviamo a convertirlo
  if (typeof v === "object" && typeof v.url === "string") {
    return [{ url: v.url }];
  }

  return v;
}

async function fetchMetaFields(opts: { token: string; baseId: string; tableName: string }) {
  const { token, baseId, tableName } = opts;

  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Airtable meta failed (${r.status}): ${t}`);
  }

  const j = await r.json();
  const table = (j.tables || []).find((t: any) => t.name === tableName);

  const fields: MetaField[] = Array.isArray(table?.fields)
    ? table.fields.map((f: any) => ({ name: f.name, type: f.type }))
    : [];

  return fields;
}

async function fetchRecord(opts: { token: string; baseId: string; tableName: string; recordId: string }) {
  const { token, baseId, tableName, recordId } = opts;

  const r = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Airtable fetch record failed (${r.status}): ${t}`);
  }

  return r.json();
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = (session?.user?.email || "").toLowerCase().trim();
    if (!email) return json(false, { error: "Unauthorized" }, 401);

    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.includes(email)) return json(false, { error: "Forbidden" }, 403);

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || "";
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
    const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS || process.env.AIRTABLE_EVENTS_TABLE || "EVENTS";

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return json(false, { error: "Missing env (AIRTABLE_*)" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const sourceId = String(body?.id || body?.recordId || "").trim();
    if (!sourceId) return json(false, { error: "Missing id" }, 400);

    // 1) meta fields -> per filtrare i non scrivibili e capire attachments
    const metaFields = await fetchMetaFields({
      token: AIRTABLE_TOKEN,
      baseId: AIRTABLE_BASE_ID,
      tableName: AIRTABLE_TABLE_EVENTS,
    });

    const byName: Record<string, MetaField> = {};
    for (const f of metaFields) byName[f.name] = f;

    // 2) record originale
    const source = await fetchRecord({
      token: AIRTABLE_TOKEN,
      baseId: AIRTABLE_BASE_ID,
      tableName: AIRTABLE_TABLE_EVENTS,
      recordId: sourceId,
    });

    const srcFields: Record<string, any> = source?.fields || {};

    // 3) costruisci fields duplicati filtrando scrivibili + sanitize attachment
    const fields: Record<string, any> = {};

    for (const [k, v] of Object.entries(srcFields)) {
      const meta = byName[k];
      if (!meta) continue; // campo non in meta: skip
      if (!isWritableFieldType(meta.type)) continue;

      if (isAttachmentType(meta.type)) {
        fields[k] = sanitizeAttachmentValue(v);
      } else {
        fields[k] = v;
      }
    }

    // 4) regole di business: Featured mai duplicato
    if ("Featured" in fields) fields["Featured"] = false;

    // 5) rinomina evento (se esiste)
    const nameKey = Object.prototype.hasOwnProperty.call(fields, "Event Name")
      ? "Event Name"
      : Object.prototype.hasOwnProperty.call(fields, "name")
      ? "name"
      : null;

    if (nameKey) {
      const baseName = String(fields[nameKey] || "").trim();
      fields[nameKey] = baseName ? `${baseName} (copy)` : "Event (copy)";
    }

    // 6) CREATE
    const createRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    const createText = await createRes.text();
    if (!createRes.ok) {
      console.error("Duplicate: create failed:", createRes.status, createText);
      return json(false, { error: "Airtable duplicate failed", detail: createText }, 500);
    }

    const created = JSON.parse(createText);
    return json(true, { id: created?.id, record: created });
  } catch (e: any) {
    console.error("Duplicate error:", e);
    return json(false, { error: e?.message || "Unknown error" }, 500);
  }
}
