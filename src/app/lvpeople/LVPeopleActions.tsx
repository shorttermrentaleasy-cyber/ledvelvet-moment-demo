"use client";

import React from "react";
import { signOut } from "next-auth/react";

export default function LVPeopleActions() {
  return (
    <div className="flex items-center gap-2">
      <a
        href="/moment2"
        className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
      >
        Back
      </a>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/admin/login" })}
        className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
      >
        Quit
      </button>
    </div>
  );
}
