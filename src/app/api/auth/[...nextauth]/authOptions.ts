import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

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
      async sendVerificationRequest({ identifier, url }) {
        // ✅ generico (non solo admin)
        const subject = "Accesso LedVelvet";

        const html = `
          <div style="font-family:Arial,sans-serif">
            <h2>LedVelvet</h2>
            <p>Clicca sul pulsante per accedere:</p>
            <p>
              <a href="${url}" style="padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:8px">
                Accedi
              </a>
            </p>
            <p style="font-size:12px;color:#666">
              Se non hai richiesto l’accesso, ignora questa email.
            </p>
          </div>
        `;

        await sendWithResend({ to: identifier, subject, html });
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
