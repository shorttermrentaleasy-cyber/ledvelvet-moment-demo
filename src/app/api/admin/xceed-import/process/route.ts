import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normEmail(v: any): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  // minimale: accetta solo se sembra email
  if (!s.includes("@") || !s.includes(".")) return null;
  return s;
}

function normPhone(v: any): string | null {
  let s = String(v ?? "").trim();
  if (!s) return null;
  // tieni solo numeri e +
  s = s.replace(/[^\d+]/g, "");
  // normalizzazione IT minimale: se 39 senza +, metti +
  if (/^39\d{8,}$/.test(s)) s = `+${s}`;
  // se parte con 0 o 3 e non ha prefisso, lascia com'è (MVP)
  return s.length >= 6 ? s : null;
}

function toStringSafe(v: any): string {
  return String(v ?? "").trim();
}

function headerKey(h: string) {
  return (h || "").toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
}

function pickColumn(headers: string[], patterns: string[]) {
  const keys = headers.map(h => ({ h, k: headerKey(h) }));
  for (const p of patterns) {
    const pk = headerKey(p);
    const found = keys.find(x => x.k.includes(pk));
    if (found) return found.h;
  }
  return null;
}

function detectColumns(headers: string[]) {
  const qr = pickColumn(headers, ["qr", "qrcode", "qr_code", "barcode", "code", "ticketcode", "ticket"]);
  const email = pickColumn(headers, ["email", "e-mail", "mail"]);
  const phone = pickColumn(headers, ["phone", "mobile", "tel", "telefono", "cell", "cellulare"]);
  return { qr, email, phone };
}

function parseCSV(buf: Buffer) {
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length === 0) return { rows: [], headers: [] as string[] };

  // separatore: prova ; poi , poi \t
  const first = lines[0];
  const sep = first.includes(";") ? ";" : first.includes(",") ? "," : "\t";

  const headers = first.split(sep).map(s => s.trim().replace(/^"|"$/g, ""));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep);
    const row: any = {};
    headers.forEach((h, idx) => {
      const raw = (parts[idx] ?? "").trim();
      row[h] = raw.replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return { rows, headers };
}

async function updateBatch(
  supabase: ReturnType<typeof supabaseAdmin>,
  batch_id: string,
  patch: Record<string, any>
) {
  await supabase.from("xceed_import_batches").update(patch).eq("id", batch_id);
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  let batch_id = "";
  try {
    const body = await req.json();
    batch_id = String(body?.batch_id || "").trim();
    if (!batch_id) {
      return NextResponse.json({ ok: false, error: "Missing batch_id" }, { status: 400 });
    }

    // lock "soft": set processing
    await updateBatch(supabase, batch_id, { status: "processing", error: null });

    const { data: batch, error: bErr } = await supabase
      .from("xceed_import_batches")
      .select("id,event_id,file_path,file_name")
      .eq("id", batch_id)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!batch) return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });

    const event_id = batch.event_id as string;
    const file_path = batch.file_path as string;
    const file_name = (batch.file_name as string) || "";

    // download file
    const { data: dl, error: dlErr } = await supabase.storage.from("xceed-imports").download(file_path);
    if (dlErr) throw new Error(dlErr.message);
    if (!dl) throw new Error("Download failed");

    const arr = await dl.arrayBuffer();
    const buf = Buffer.from(arr);

    // parse
    let rows: any[] = [];
    let headers: string[] = [];

    const lower = file_name.toLowerCase();
    const isCSV = lower.endsWith(".csv") || dl.type === "text/csv";

    if (isCSV) {
      const parsed = parseCSV(buf);
      rows = parsed.rows;
      headers = parsed.headers;
    } else {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
      rows = json;
      headers = json.length ? Object.keys(json[0]) : [];
    }

    if (!rows.length) {
      await updateBatch(supabase, batch_id, { status: "failed", error: "Empty file", rows_total: 0, rows_inserted: 0 });
      return NextResponse.json({ ok: false, error: "Empty file" }, { status: 400 });
    }

    const cols = detectColumns(headers);
    if (!cols.qr) {
      await updateBatch(supabase, batch_id, { status: "failed", error: "Cannot detect QR column", rows_total: rows.length, rows_inserted: 0 });
      return NextResponse.json({ ok: false, error: "Cannot detect QR column" }, { status: 400 });
    }

    // map rows
    const payload = rows
      .map((r) => {
        const qr = toStringSafe(r[cols.qr!]);
        if (!qr) return null;

        const buyer_email = cols.email ? toStringSafe(r[cols.email]) : "";
        const buyer_phone = cols.phone ? toStringSafe(r[cols.phone]) : "";

        const buyer_email_norm = normEmail(buyer_email);
        const buyer_phone_norm = normPhone(buyer_phone);

        return {
          event_id,
          qr_code: qr,
          buyer_email: buyer_email || null,
          buyer_phone: buyer_phone || null,
          buyer_email_norm,
          buyer_phone_norm,
          raw: r, // audit
        };
      })
      .filter(Boolean) as any[];

    const rows_total = payload.length;

    // batch insert in chunks
    let inserted = 0;
    const CHUNK = 500;

    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);

      // upsert with ignore duplicates: requires unique(event_id, qr_code)
      const { data: ins, error: insErr } = await supabase
        .from("xceed_tickets")
        .upsert(chunk, { onConflict: "event_id,qr_code", ignoreDuplicates: true })
        .select("id");

      if (insErr) throw new Error(insErr.message);
      inserted += (ins?.length || 0);
    }

    await updateBatch(supabase, batch_id, {
      status: "done",
      rows_total,
      rows_inserted: inserted,
      error: null,
    });

    return NextResponse.json({
      ok: true,
      batch_id,
      event_id,
      file_path,
      detected: cols,
      rows_total,
      rows_inserted: inserted,
    });
  } catch (e: any) {
    if (batch_id) {
      try {
        await updateBatch(supabase, batch_id, { status: "failed", error: e?.message || "Unknown error" });
      } catch {}
    }
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export {};
