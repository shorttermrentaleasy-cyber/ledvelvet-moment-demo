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
  // Airtable: questi tipi NON sono scrivibili direttamente
  const notWritable = new Set([
    "formula",
    "rollup",
    "count",
    "autoNumber",
    "createdTime",
    "lastModifiedTime",
    "multipleRecordLinks", // in realtà è scrivibile, ma lo lasciamo passare sotto con controllo diverso
    "multipleLookupValues",
    "lookup",
    "button",
    "barcode",
  ]);

  // multipleRecordLinks è scrivibile -> la togliamo dalla blacklist
  notWritable.delete("multipleRecordLinks");

  return !notWritable.has(t);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json(false, { error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const id = body?.id;
    if (!id) return json(false, { error: "Missing id" }, 400);

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      return json(false, { error: "Missing Airtable env" }, 500);
    }

    const tableName = AIRTABLE_TABLE_EVENTS; // es. "EVENTS"

    const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      tableName
    )}`;

    // 1) prendo record originale
    const getRes = await fetch(`${baseUrl}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    });

    const getText = await getRes.text();
    if (!getRes.ok) {
      console.error("Duplicate: fetch original failed:", getRes.status, getText);
      return json(false, { error: "Fetch original failed" }, 500);
    }

    const original = JSON.parse(getText);
    const originalFields: Record<string, any> = original?.fields || {};

    // 2) prendo schema meta per capire campi scrivibili
    // (usa Airtable Meta API - richiede scopes schema/metadata sul token)
    const metaRes = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        cache: "no-store",
      }
    );

    const metaText = await metaRes.text();
    if (!metaRes.ok) {
      console.error("Duplicate: meta failed:", metaRes.status, metaText);
      return json(false, { error: "Airtable meta error (token scopes?)" }, 500);
    }

    const meta = JSON.parse(metaText);
    const eventsTable =
      (meta?.tables || []).find((t: any) => t?.name === tableName) ||
      (meta?.tables || []).find((t: any) => String(t?.name || "").toLowerCase() === String(tableName).toLowerCase());

    if (!eventsTable) {
      return json(false, { error: `${tableName} table not found in meta` }, 500);
    }

    const fieldsMeta: MetaField[] = eventsTable.fields || [];

    // 3) costruisco fields duplicabili: solo quelli scrivibili e presenti nell'originale
    const writableNames = new Set(
      fieldsMeta.filter((f) => isWritableFieldType(f.type)).map((f) => f.name)
    );

    const fieldsToCreate: Record<string, any> = {};
    for (const [k, v] of Object.entries(originalFields)) {
      if (!writableNames.has(k)) continue;
      fieldsToCreate[k] = v;
    }

    // 4) aggiungo "(copy)" al nome evento
    if (typeof fieldsToCreate["Event Name"] === "string" && fieldsToCreate["Event Name"].trim()) {
      fieldsToCreate["Event Name"] = `${fieldsToCreate["Event Name"]} (copy)`;
    } else if (typeof fieldsToCreate["Event name"] === "string" && fieldsToCreate["Event name"].trim()) {
      fieldsToCreate["Event name"] = `${fieldsToCreate["Event name"]} (copy)`;
    } else if (typeof fieldsToCreate["Name"] === "string" && fieldsToCreate["Name"].trim()) {
      fieldsToCreate["Name"] = `${fieldsToCreate["Name"]} (copy)`;
    }

    // 5) creo record duplicato
    const createRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: fieldsToCreate }),
    });

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
