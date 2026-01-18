import type { NextAuthOptions } from "next-auth";
import * as QRCode from "qrcode";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

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
  if (!apiKey) {
    throw new Error("Resend error: missing RESEND_API_KEY");
  }

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
      to: [to], // sempre array
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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    EmailProvider({
      async sendVerificationRequest({ identifier, url }) {
        const subject = "Accesso area admin LedVelvet";

        const html = `
          <div style="font-family:Arial,sans-serif">
            <h2>LedVelvet – Admin</h2>
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

        await sendWithResend({
          to: identifier,
          subject,
          html,
        });
      },
    }),
  ],

  pages: {
    signIn: "/admin/login",
    verifyRequest: "/admin/verify",
  },

  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return getAllowedAdmins().includes(user.email.toLowerCase());
    },

    async redirect({ baseUrl }) {
      return `${baseUrl}/admin`;
    },
  },

  session: {
    strategy: "database",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
