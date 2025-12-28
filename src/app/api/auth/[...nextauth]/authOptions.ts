import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function getAllowedAdmins(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    EmailProvider({
      // Puoi usare o EMAIL_SERVER (stringa) oppure SMTP_* (host/port/user/pass)
      // Qui usiamo SMTP_* perché è più chiaro.
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      },
      from: process.env.EMAIL_FROM,
      // maxAge: 10 * 60, // opzionale: link valido 10 minuti
    }),
  ],

  pages: {
    signIn: "/admin/login",
    verifyRequest: "/admin/verify",
    error: "/admin/auth-error",
  },

  callbacks: {
    async signIn({ user }) {
      const email = (user?.email || "").toLowerCase().trim();
      if (!email) return false;

      const allowed = getAllowedAdmins();
      return allowed.includes(email);
    },
  },

  session: { strategy: "database" },

  // Consigliato in prod (evita problemi di URL)
  secret: process.env.NEXTAUTH_SECRET,
};
