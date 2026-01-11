"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function RefreshStampClient() {
  const sp = useSearchParams();

  useEffect(() => {
    // quando arrivi qui dopo un save redirect("/admin/events?refresh=1")
    if (sp.get("refresh") === "1") {
      try {
        localStorage.setItem("lv_events_updated_at", String(Date.now()));
      } catch {}
    }
  }, [sp]);

  return null;
}
