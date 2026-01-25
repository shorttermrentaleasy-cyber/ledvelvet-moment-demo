/* scripts/import_xceed_xlsx.cjs
 *
 * Importa un export Xceed (XLSX) in public.xceed_tickets agganciandolo a un event_id Supabase (UUID).
 *
 * Uso:
 *   node scripts/import_xceed_xlsx.cjs --event 79d99a52-f530-424e-858e-8a6d0a329c54 --file "/path/file.xlsx"
 *
 * Richiede in .env.local (o env):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE=...
 */

require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function must(name, value) {
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function toStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizePhone(v) {
  const s = toStr(v);
  if (!s) return null;
  // lascia com'è, ma ripulisce spazi inutili
  return s.replace(/\s+/g, "");
}

function parseBookingDate(v) {
  // XLSX può dare Date o stringa; convertiamo in ISO (timestamptz lo accetta)
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const s = toStr(v);
  if (!s) return null;

  // Prova parse standard
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  return null;
}

(async () => {
  const eventId = must("--event", arg("--event"));
  const file = must("--file", arg("--file"));

  const SUPABASE_URL = must("SUPABASE_URL", process.env.SUPABASE_URL);
  const SUPABASE_SERVICE_ROLE = must("SUPABASE_SERVICE_ROLE", process.env.SUPABASE_SERVICE_ROLE);

  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const importBatchId = crypto.randomUUID();

  console.log("Import Xceed XLSX");
  console.log("  event_id:", eventId);
  console.log("  file:", file);
  console.log("  import_batch_id:", importBatchId);

  // Leggi XLSX
  const wb = XLSX.readFile(file, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // array di oggetti con header dalla prima riga
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  console.log("  rows:", rows.length);
  if (!rows.length) {
    console.log("No rows to import.");
    process.exit(0);
  }

  // Mappatura colonne (basata sul tuo export reale)
  // - QR Code (chiave)
  // - Status
  // - Full Name / First Name / Last Name
  // - email, phone
  // - Booking Date
  // - Transaction Id
  const mapped = [];
  for (const r of rows) {
    const qr = toStr(r["QR Code"] || r["QR"] || r["qr_code"]);
    if (!qr) continue; // riga senza QR non serve

    const fullName =
      toStr(r["Full Name"]) ||
      [toStr(r["First Name"]), toStr(r["Last Name"])].filter(Boolean).join(" ") ||
      toStr(r["firstName"]) && toStr(r["lastName"])
        ? [toStr(r["firstName"]), toStr(r["lastName"])].filter(Boolean).join(" ")
        : null;

    const email = toStr(r["email"] || r["Email"]);
    const phone = normalizePhone(r["phone"] || r["Phone"]);
    const status = toStr(r["Status"] || r["status"]);
    const bookingDate = parseBookingDate(r["Booking Date"] || r["booking_date"]);
    const txid = toStr(r["Transaction Id"] || r["Transaction ID"] || r["transaction_id"]);

    mapped.push({
      event_id: eventId,
      qr_code: qr,
      status,
      full_name: fullName,
      email,
      phone,
      booking_date: bookingDate,
      transaction_id: txid,
      import_batch_id: importBatchId,
      raw: r, // conserva TUTTO
    });
  }

  console.log("  mapped rows (with QR):", mapped.length);
  if (!mapped.length) {
    console.log("No valid rows (no QR Code found).");
    process.exit(0);
  }

  // Inserimento a batch + ignore duplicati via upsert
  const BATCH = 500;
  let insertedTotal = 0;
  let batchNum = 0;

  for (let i = 0; i < mapped.length; i += BATCH) {
    batchNum++;
    const chunk = mapped.slice(i, i + BATCH);

    const { data, error } = await supabase
      .from("xceed_tickets")
      .upsert(chunk, {
        onConflict: "event_id,qr_code",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      console.error("Batch error:", error.message);
      process.exit(1);
    }

    const inserted = (data || []).length;
    insertedTotal += inserted;

    console.log(`  batch ${batchNum}: sent=${chunk.length} inserted=${inserted}`);
  }

  console.log("DONE");
  console.log("  inserted_total:", insertedTotal);
  console.log("  import_batch_id:", importBatchId);

  // Verifica rapida: conta righe importate in questo batch
  const { count, error: countErr } = await supabase
    .from("xceed_tickets")
    .select("*", { count: "exact", head: true })
    .eq("import_batch_id", importBatchId);

  if (countErr) {
    console.warn("Count warning:", countErr.message);
  } else {
    console.log("  verified batch count:", count);
  }
})();
