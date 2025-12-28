import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function getAllowedAdmins(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to,
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
