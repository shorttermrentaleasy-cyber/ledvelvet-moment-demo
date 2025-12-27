"use client";

import { SessionProvider } from "next-auth/react";

export default function AdminProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
