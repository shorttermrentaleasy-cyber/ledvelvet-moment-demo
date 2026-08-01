import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function env(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdminEmail() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return email && allowed.includes(email) ? email : null;
}

function supabaseAdmin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanFrom(raw?: string | null) {
  return (raw || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "");
}

function isValidFromFormat(from: string) {
  const emailOnly = /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/;
  const nameEmail = /^[^<>"]+\s<[^<>\s"]+@[^<>\s"]+\.[^<>\s"]+>$/;
  return emailOnly.test(from) || nameEmail.test(from);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .replace(
      /(https:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#f0c5dc;text-decoration:underline;overflow-wrap:anywhere">$1</a>'
    )
    .replace(/\n/g, "<br>");
}

function emailHtml(text: string) {
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#ece9e4;color:#171717;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ece9e4">
      <tr>
        <td align="center" style="padding:36px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#111111;border-radius:22px;overflow:hidden">
            <tr>
              <td style="padding:34px 38px 18px;text-align:center">
                <div style="font-size:12px;letter-spacing:5px;color:#d7b7ad;font-weight:700">LEDVELVET</div>
                <div style="width:42px;height:2px;background:#d7b7ad;margin:18px auto 0"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 38px 38px;color:#dddddd;font-size:16px;line-height:1.7">
                ${textToHtml(text)}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 38px;border-top:1px solid #2b2b2b;text-align:center;color:#777777;font-size:12px;line-height:1.5">
                LEDVELVET · Comunicazione relativa alla partecipazione all’evento
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function addHistory(
  anomalyId: string,
  status: string,
  note: string,
  adminEmail: string
) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("ticket_anomaly_history").insert({
    anomaly_id: anomalyId,
    status,
    note,
    admin_email: adminEmail,
  });
  if (error) throw error;
}

export async function POST(request: Request) {
  const adminEmail = await requireAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  let anomalyId = "";
  let anomalyStatus = "open";
  let recipient = "";

  try {
    const body = await request.json().catch(() => null);
    const eventId = String(body?.event_id || "").trim();
    const ticketRef = String(body?.ticket_ref || "").trim();
    recipient = String(body?.recipient || "").trim().toLowerCase();
    const subject = String(body?.subject || "").trim();
    const text = String(body?.text || "").trim();

    if (!eventId || !ticketRef || !recipient || !subject || !text) {
      return NextResponse.json(
        { ok: false, error: "Evento, biglietto, destinatario, oggetto e testo sono obbligatori" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return NextResponse.json({ ok: false, error: "Email destinatario non valida" }, { status: 400 });
    }
    if (ticketRef.length > 255 || recipient.length > 320 || subject.length > 180 || text.length > 8000) {
      return NextResponse.json({ ok: false, error: "Dati email troppo lunghi" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data: anomaly, error: anomalyError } = await supabase
      .from("ticket_anomalies")
      .select("id,status")
      .eq("event_id", eventId)
      .eq("ticket_ref", ticketRef)
      .maybeSingle();
    if (anomalyError) throw anomalyError;
    if (!anomaly) {
      return NextResponse.json(
        { ok: false, error: "Salva prima la gestione dell’anomalia" },
        { status: 409 }
      );
    }

    anomalyId = String(anomaly.id);
    anomalyStatus = String(anomaly.status || "open");

    const apiKey = env("RESEND_API_KEY");
    const fromRaw = cleanFrom(process.env.EMAIL_FROM) || "onboarding@resend.dev";
    const from = isValidFromFormat(fromRaw) ? fromRaw : "onboarding@resend.dev";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html: emailHtml(text),
        text,
      }),
    });
    const resendPayload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = String(resendPayload?.message || `HTTP ${response.status}`);
      await addHistory(
        anomalyId,
        anomalyStatus,
        `Invio email fallito verso ${recipient}: ${detail}`.slice(0, 2000),
        adminEmail
      ).catch(() => undefined);
      throw new Error(`Resend: ${detail}`);
    }

    await addHistory(
      anomalyId,
      anomalyStatus,
      `Email inviata a ${recipient} · Oggetto: ${subject}`,
      adminEmail
    );

    return NextResponse.json({
      ok: true,
      recipient,
      message_id: resendPayload?.id || null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
