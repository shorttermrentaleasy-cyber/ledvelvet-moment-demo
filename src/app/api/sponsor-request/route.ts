import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(ok: boolean, data: any, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

function cleanFrom(raw?: string | null) {
  return (raw || "").trim().replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
}

function isValidFromFormat(from: string) {
  const emailOnly = /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/;
  const nameEmail = /^[^<>"]+\s<[^<>\s"]+@[^<>\s"]+\.[^<>\s"]+>$/;
  return emailOnly.test(from) || nameEmail.test(from);
}

async function sendResend(params: { to: string | string[]; subject: string; html: string; text?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const rawFrom = cleanFrom(process.env.EMAIL_FROM);
  const from = isValidFromFormat(rawFrom) ? rawFrom : "LedVelvet <admin@ledvelvet.it>";

  const toArr = Array.isArray(params.to) ? params.to : [params.to];
  const toClean = toArr.map((s) => (s || "").trim()).filter(Boolean);
  if (toClean.length === 0) throw new Error("No recipients defined (to empty)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: toClean,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const brand = (body?.brand || "").trim();
    const name = (body?.name || "").trim();
    const phone = (body?.phone || "").trim();
    const email = (body?.email || "").trim();
    const budget = (body?.budget || "").toString().trim();
    const note = (body?.note || "").trim();

    if (!name || !email) {
      return json(false, { error: "Missing required fields (name/email)" }, 400);
    }

    // 1) salva su Airtable (come fai già: qui lascio invariato, metti il tuo codice se diverso)
    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_SPONSORS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_SPONSORS) {
      return json(false, { error: "Missing Airtable env" }, 500);
    }

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_SPONSORS)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Brand: brand || "",
            Name: name,
            Phone: phone || "",
            Email: email,
            Budget: budget || "",
            Notes: note || "",
          },
        }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      console.error("Airtable error:", err);
      return json(false, { error: "Airtable error" }, 500);
    }

    // 2) mail al team (DESTINATARIO INTERNO)
    const teamTo = (process.env.SPONSOR_NOTIFY_TO || "").trim();
    if (!teamTo) throw new Error("Missing SPONSOR_NOTIFY_TO");

    await sendResend({
      to: teamTo,
      subject: "Nuova richiesta Sponsor – LedVelvet",
      html: `
        <h3>Nuova richiesta sponsor</h3>
        <ul>
          <li><b>Brand:</b> ${brand || "-"}</li>
          <li><b>Nome:</b> ${name}</li>
          <li><b>Email:</b> ${email}</li>
          <li><b>Telefono:</b> ${phone || "-"}</li>
          <li><b>Budget:</b> ${budget || "-"}</li>
          <li><b>Note:</b> ${note || "-"}</li>
        </ul>
      `,
    });

    // 3) mail di conferma allo sponsor
    await sendResend({
      to: email,
      subject: "LedVelvet – richiesta sponsor ricevuta",
      html: `<p>Ciao ${name}, abbiamo ricevuto la tua richiesta. Ti contatteremo a breve.</p><p>— LedVelvet</p>`,
    });

    return json(true, { message: "ok" });
  } catch (e: any) {
    console.error("SPONSOR_REQUEST_ERROR:", e);
    return json(false, { error: "Internal error" }, 500);
  }
}
