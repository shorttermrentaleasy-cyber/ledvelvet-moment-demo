import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const allowedAdmins = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      } as any,
      from: process.env.SMTP_USER,
    }),
  ],
  pages: {
    signIn: "/admin/login",
    verifyRequest: "/admin/verify",
	error: "/admin/auth-error",
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user?.email || "").toLowerCase();
      if (!email) return false;
      return allowedAdmins.includes(email);
    },
  },
  session: { strategy: "database" },
};
