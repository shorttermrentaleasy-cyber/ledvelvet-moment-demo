import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

function getAllowedAdmins(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function cleanFrom(raw?: string | null) {
  // rimuove spazi e virgolette accidentalmente messe in Vercel
  const v = (raw || "").trim().replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
  return v;
}

function isValidFromFormat(from: string) {
  // accetta:
  // - email@example.com
  // - Name <email@example.com>
  const emailOnly = /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/;
  const nameEmail = /^[^<>"]+\s<[^<>\s"]+@[^<>\s"]+\.[^<>\s"]+>$/;
  return emailOnly.test(from) || nameEmail.test(from);
}

async function sendWithResend({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend error: missing RESEND_API_KEY");

  const fromRaw = cleanFrom(process.env.EMAIL_FROM) || "onboarding@resend.dev";
  const from = isValidFromFormat(fromRaw) ? fromRaw : "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function isMemberEmail(emailRaw: string): Promise<boolean> {
  const email = (emailRaw || "").toLowerCase().trim();
  if (!email) return false;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("members")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (error) return false;
    return !!data?.id;
  } catch {
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    EmailProvider({
      maxAge: 10 * 60,
      generateVerificationToken() {
        return randomInt(10_000_000, 100_000_000).toString();
      },
      async sendVerificationRequest({ identifier, url }) {
        // ✅ generico (non solo admin)
        const subject = "Il tuo accesso a LEDVELVET";
        const accessCode = new URL(url).searchParams.get("token") || "";

        const html = `
          <!doctype html>
          <html lang="it">
            <body style="margin:0;padding:0;background:#ece9e4;color:#171717;font-family:Arial,Helvetica,sans-serif">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ece9e4">
                <tr>
                  <td align="center" style="padding:36px 16px">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#111111;border-radius:22px;overflow:hidden">
                      <tr>
                        <td style="padding:38px 38px 18px;text-align:center">
                          <div style="font-size:12px;letter-spacing:5px;color:#d7b7ad;font-weight:700">LEDVELVET</div>
                          <div style="width:42px;height:2px;background:#d7b7ad;margin:18px auto 0"></div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 38px 38px;text-align:center">
                          <h1 style="margin:0 0 16px;color:#ffffff;font-size:30px;line-height:1.15;font-weight:500">Il tuo accesso è pronto</h1>
                          <p style="margin:0 auto 28px;max-width:430px;color:#c9c9c9;font-size:16px;line-height:1.6">
                            Clicca sul pulsante per confermare il tuo indirizzo email ed entrare nella tua area LEDVELVET.
                          </p>
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                            <tr>
                              <td align="center" bgcolor="#d7b7ad" style="border-radius:999px">
                                <a href="${url}" style="display:inline-block;padding:15px 34px;color:#111111;font-size:15px;font-weight:700;letter-spacing:.4px;text-decoration:none;border-radius:999px">
                                  ACCEDI A LEDVELVET
                                </a>
                              </td>
                            </tr>
                          </table>
                          <div style="margin:28px auto 0;max-width:430px;border-top:1px solid #2b2b2b;padding-top:24px">
                            <p style="margin:0;color:#c9c9c9;font-size:14px;line-height:1.6">
                              Se stai leggendo questa email su un altro dispositivo, inserisci questo codice nel browser dove hai richiesto l’accesso:
                            </p>
                            <div style="margin:14px 0 0;color:#ffffff;font-size:30px;line-height:1;font-weight:700;letter-spacing:7px">${accessCode}</div>
                            <p style="margin:12px 0 0;color:#888888;font-size:12px;line-height:1.5">
                              Link e codice scadono dopo 10 minuti e possono essere utilizzati una sola volta.
                            </p>
                          </div>
                          <p style="margin:28px auto 0;max-width:430px;color:#999999;font-size:13px;line-height:1.6">
                            Se hai lasciato aperta la homepage, dopo il clic l’accesso verrà aggiornato automaticamente. La schermata di conferma proverà poi a chiudersi da sola.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:20px 38px;border-top:1px solid #2b2b2b;text-align:center">
                          <p style="margin:0;color:#777777;font-size:12px;line-height:1.5">
                            Non hai richiesto tu questo accesso? Puoi ignorare questa email in sicurezza.
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:18px 0 0;color:#777777;font-size:11px;line-height:1.5">
                      LEDVELVET · Accesso personale e protetto
                    </p>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `;

        const text = `Il tuo accesso a LEDVELVET è pronto.

Apri questo link per confermare il tuo indirizzo email e accedere:
${url}

In alternativa, inserisci questo codice nel browser dove hai richiesto l'accesso:
${accessCode}

Link e codice scadono dopo 10 minuti e possono essere utilizzati una sola volta.

Se hai lasciato aperta la homepage, l’accesso verrà aggiornato automaticamente. Se non hai richiesto tu questa email, puoi ignorarla.`;

        await sendWithResend({ to: identifier, subject, html, text });
      },
    }),
  ],

  // ✅ un solo entrypoint UI

  pages: {
  signIn: "/login",
  verifyRequest: "/verify",
  error: "/login", // ⬅️ QUESTO È IL FIX
},


  callbacks: {
    async signIn({ user }) {
      const email = user?.email?.toLowerCase().trim();
      if (!email) return false;

      // ✅ admin OR socio (presente in public.members)
      if (getAllowedAdmins().includes(email)) return true;

      const memberOk = await isMemberEmail(email);
      return memberOk;
    },

    // ✅ NON forzare /admin: lasciamo passare il callbackUrl
    async redirect({ url, baseUrl }) {
      // allow relative callback urls
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // allow callback urls on same origin
      if (url.startsWith(baseUrl)) return url;
      // fallback safe
      return `${baseUrl}/login`;
    },

    // ✅ mettiamo role in session (senza cambiare schema Prisma)
    async session({ session, user }) {
      const email = user?.email?.toLowerCase().trim() || session?.user?.email?.toLowerCase().trim() || "";

      const isAdmin = email ? getAllowedAdmins().includes(email) : false;
      let isMember = false;

      if (email && !isAdmin) {
        isMember = await isMemberEmail(email);
      } else if (email && isAdmin) {
        // admin può anche essere socio: non ci interessa ora
        isMember = await isMemberEmail(email);
      }

      (session as any).role = isAdmin ? "admin" : isMember ? "member" : "unknown";
      return session;
    },
  },

  session: {
    strategy: "database",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
