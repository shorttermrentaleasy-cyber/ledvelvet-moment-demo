"use client";

import React from "react";

export default function LVPeopleActions() {
  function closeMemberCard() {
    window.close();

    window.setTimeout(() => {
      if (!window.closed) {
        window.history.back();
      }
    }, 100);
  }

  return (
    <div>
      <button
        type="button"
        onClick={closeMemberCard}
        className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
      >
        Chiudi
      </button>
    </div>
  );
}
