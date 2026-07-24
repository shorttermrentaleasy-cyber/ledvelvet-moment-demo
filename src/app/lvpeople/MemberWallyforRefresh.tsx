"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function MemberWallyforRefresh({ barcode }: { barcode: string }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!barcode || started.current) return;
    started.current = true;

    const controller = new AbortController();

    void fetch("/api/account/wallyfor-refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode }),
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.ok && payload?.changed) router.refresh();
      })
      .catch(() => {
        // La scheda continua a mostrare gli ultimi dati salvati.
      });

    return () => controller.abort();
  }, [barcode, router]);

  return null;
}
