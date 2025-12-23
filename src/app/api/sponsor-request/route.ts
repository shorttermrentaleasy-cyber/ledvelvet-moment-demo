import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

type SponsorPayload = {
  brand: string;
  name: string;
  email: string;
  phone?: string;
  budget?: string;
  note?: string;
};

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    // --- Airtable env ---
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_SPONSOR_REQUESTS = process.env.AIRTABLE_TABLE_SPONSOR_REQUESTS;

    if (!AIRTABLE_TOKEN) return badRequest("Missing AIRTABLE_TOKEN env var");
    if (!AIRTABLE_BASE_ID) return badRequest("Missing AIRTABLE_BASE_ID env var");
    if (!AIRTABLE_TABLE_SPONSOR_REQUESTS) return badRequest("Missing AIRTABLE_TABLE_SPONSOR_REQUESTS env var");

    // --- SMTP env ---
    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = process.env.SMTP_PORT;
    const SMTP_USER = process.env.SMTP_USER; // es: sponsor@ledvelvet.com
    const SMTP_PASS = process.env.SMTP_PASS;

    if (!SMTP_HOST) return badRequest("Missing SMTP_HOST env var");
    if (!SMTP_PORT) return badRequest("Missing SMTP_PORT env var");
    if (!SMTP_USER) return badRequest("Missing SMTP_USER env var");
    if (!SMTP_PASS) return badRequest("Missing SMTP_PASS env var");

    const body = (await req.json()) as SponsorPayload;

    const brand = (body.brand || "").trim();
    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const phone = (body.phone || "").trim();
    const budget = (body.budget || "").trim();
    const note = (body.note || "").trim();

    if (!brand) return badRequest("Brand/Azienda obbligatorio");
    if (!name) return badRequest("Referente obbligatorio");
    if (!email) return badRequest("Email obbligatoria");

    // 1) --- Airtable insert ---
    // ALLINEA i nomi dei campi sotto ai campi reali della tua tabella Airtable
    // (Se in Airtable si chiamano diversamente, qui va cambiato.)
    const fields = {
      brand,
      name,
      email,
      phone,
      budget,
      note,
      source: "website",
      status: "New",
      createdAt: new Date().toISOString(),
    };

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_SPONSOR_REQUESTS
    )}`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }] }),
    });

    const airtableData = await r.json();

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "Airtable error", details: airtableData },
        { status: 500 }
      );
    }

    const recordId = airtableData?.records?.[0]?.id || null;

    // 2) --- Email notify ---
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // 465 = SSL
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const subject = `Nuova richiesta Sponsor — ${brand}`;
    const text = [
      `Nuova richiesta sponsor dal sito LedVelvet`,
      ``,
      `Brand/Azienda: ${brand}`,
      `Referente: ${name}`,
      `Email: ${email}`,
      `Telefono: ${phone || "-"}`,
      `Budget: ${budget || "-"}`,
      `Note: ${note || "-"}`,
      ``,
      `Airtable Record: ${recordId || "n/a"}`,
      `Data: ${new Date().toLocaleString("it-IT")}`,
    ].join("\n");

    await transporter.sendMail({
      from: `"LedVelvet Website" <${SMTP_USER}>`,
      to: SMTP_USER, // sponsor@ledvelvet.com
      replyTo: email, // così rispondi direttamente al contatto
      subject,
      text,
    });

    return NextResponse.json({ ok: true, recordId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Server error", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
